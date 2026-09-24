import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { decrypt } from "./crypto";
import { db, pool } from "./db";
import { addedSince, applyActions, contextOf, GmailError, googleToken, inboxIds, message, profile } from "./gmail";
import { decide } from "./decide";
import { createRun } from "./runs";
import { mailbox, newMailSeen, runMessages, runs, settings, user } from "./schema";

type Run = typeof runs.$inferSelect;
const leaseMs = 10 * 60 * 1000;

async function claimRun(): Promise<Run | undefined> {
  const result = await pool.query<Run>(`
    update runs set status = 'running', lease_until = now() + interval '10 minutes', updated_at = now()
    where id = (
      select id from runs where status = 'queued' or (status = 'running' and lease_until < now())
      order by created_at limit 1 for update skip locked
    ) returning *`);
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    ...row,
    userId: (row as unknown as { user_id: string }).user_id,
    rulesSnapshot: (row as unknown as { rules_snapshot: Run["rulesSnapshot"] }).rules_snapshot,
    leaseUntil: (row as unknown as { lease_until: Date }).lease_until,
  };
}

async function scheduleDue() {
  const due = await db.select().from(settings).where(and(
    inArray(settings.schedule, ["15m", "1h", "24h"]), lte(settings.nextRunAt, new Date()), isNull(settings.pauseReason),
  ));
  for (const config of due) {
    const interval = { "15m": 15, "1h": 60, "24h": 1440 }[config.schedule] ?? 60;
    try { await createRun(config.userId, "new"); } catch { /* Existing run or incomplete setup: try at the next preset interval. */ }
    await db.update(settings).set({ nextRunAt: new Date(Date.now() + interval * 60_000) }).where(eq(settings.userId, config.userId));
  }
}

async function discover(run: Run, token: string) {
  const [state] = await db.select().from(mailbox).where(eq(mailbox.userId, run.userId)).limit(1);
  const [owner] = await db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, run.userId)).limit(1);
  const connectedAt = state?.connectedAt ?? owner?.createdAt ?? new Date();
  const firstHistory = (await profile(token)).historyId;
  let ids: string[];
  let nextHistory = firstHistory;
  if (run.scope === "all") ids = await inboxIds(token);
  else if (run.scope === "recent") ids = await inboxIds(token, Math.floor((Date.now() - 30 * 86400_000) / 1000));
  else if (!state?.historyId) ids = await inboxIds(token, Math.floor(connectedAt.getTime() / 1000) - 1);
  else {
    try {
      const changes = await addedSince(token, state.historyId);
      ids = changes.ids;
      nextHistory = changes.historyId;
    } catch (error) {
      if (!(error instanceof GmailError) || error.status !== 404) throw error;
      ids = await inboxIds(token, Math.floor(connectedAt.getTime() / 1000) - 1);
    }
  }
  for (let index = 0; index < ids.length; index += 200) {
    let chunk = ids.slice(index, index + 200);
    if (run.scope === "new") {
      const seen = await db.select({ messageId: newMailSeen.messageId }).from(newMailSeen)
        .where(and(eq(newMailSeen.userId, run.userId), inArray(newMailSeen.messageId, chunk)));
      const done = new Set(seen.map((item) => item.messageId));
      chunk = chunk.filter((id) => !done.has(id));
    }
    if (chunk.length) await db.insert(runMessages).values(chunk.map((id) => ({ id: crypto.randomUUID(), runId: run.id, messageId: id }))).onConflictDoNothing();
  }
  await db.transaction(async (tx) => {
    const [current] = await tx.select({ status: runs.status }).from(runs).where(eq(runs.id, run.id)).for("update").limit(1);
    if (current?.status !== "running") return;
    if (run.scope === "new") await tx.insert(mailbox).values({ userId: run.userId, connectedAt, historyId: nextHistory })
      .onConflictDoUpdate({ target: mailbox.userId, set: { historyId: nextHistory } });
    await tx.update(runs).set({ discovered: true, updatedAt: new Date() }).where(and(eq(runs.id, run.id), eq(runs.status, "running")));
  });
}

async function countRun(id: string) {
  const rows = await db.select({ state: runMessages.state, count: sql<number>`count(*)::int` }).from(runMessages)
    .where(eq(runMessages.runId, id)).groupBy(runMessages.state);
  const counts = Object.fromEntries(rows.map(({ state, count }) => [state, count]));
  return { processed: (counts.done ?? 0) + (counts.skipped ?? 0) + (counts.failed ?? 0), changed: counts.done ?? 0, skipped: counts.skipped ?? 0, failed: counts.failed ?? 0, pending: (counts.pending ?? 0) + (counts.decided ?? 0) };
}

async function processMessage(run: Run, item: typeof runMessages.$inferSelect, token: string, owner: string, key: string) {
  let selectedActions = item.actions;
  try {
    const mail = await message(token, item.messageId);
    if (!mail.labelIds?.includes("INBOX") && !selectedActions) {
      await db.update(runMessages).set({ state: "skipped" }).where(eq(runMessages.id, item.id));
    } else {
      if (!selectedActions) {
        const index = await decide(contextOf(mail, owner), run.rulesSnapshot, run.threshold, key);
        if (index < 0) {
          await db.update(runMessages).set({ state: "skipped" }).where(eq(runMessages.id, item.id));
        } else {
          selectedActions = run.rulesSnapshot[index].actions;
          await db.update(runMessages).set({ state: "decided", actions: selectedActions }).where(eq(runMessages.id, item.id));
        }
      }
      if (selectedActions) {
        const [current] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, run.id)).limit(1);
        if (current?.status !== "running") return;
        await applyActions(token, item.messageId, selectedActions);
        await db.update(runMessages).set({ state: "done" }).where(eq(runMessages.id, item.id));
      }
    }
    if (run.scope === "new") await db.insert(newMailSeen).values({ userId: run.userId, messageId: item.messageId }).onConflictDoNothing();
  } catch (error) {
    if (error instanceof GmailError && error.status === 404) {
      await db.update(runMessages).set({ state: "skipped" }).where(eq(runMessages.id, item.id));
      if (run.scope === "new") await db.insert(newMailSeen).values({ userId: run.userId, messageId: item.messageId }).onConflictDoNothing();
      return;
    }
    const status = error instanceof GmailError ? error.status : (error as { statusCode?: number })?.statusCode;
    if (status === 401 || status === 403) throw error;
    const attempts = item.attempts + 1;
    await db.update(runMessages).set({
      attempts,
      state: attempts >= 3 ? "failed" : selectedActions ? "decided" : "pending",
      nextAttemptAt: attempts >= 3 ? null : new Date(Date.now() + Math.min(60_000, 2000 * 2 ** attempts)),
    }).where(eq(runMessages.id, item.id));
  }
}

async function execute(run: Run) {
  const heartbeat = setInterval(() => {
    void db.update(runs).set({ leaseUntil: new Date(Date.now() + leaseMs) })
      .where(and(eq(runs.id, run.id), eq(runs.status, "running"))).catch(() => {});
  }, 60_000);
  try {
    const [config] = await db.select().from(settings).where(eq(settings.userId, run.userId)).limit(1);
    const [owner] = await db.select({ email: user.email }).from(user).where(eq(user.id, run.userId)).limit(1);
    if (!config?.keyCipher || !owner) throw new Error("TypeSafe key or account missing");
    const token = await googleToken(run.userId);
    if (!run.discovered) await discover(run, token);
    const key = decrypt(config.keyCipher);
    for (let batchIndex = 0; batchIndex < 20; batchIndex++) {
      const [current] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, run.id)).limit(1);
      if (current?.status !== "running") return;
      const [item] = await db.select().from(runMessages).where(and(eq(runMessages.runId, run.id),
        inArray(runMessages.state, ["pending", "decided"]),
        or(isNull(runMessages.nextAttemptAt), lte(runMessages.nextAttemptAt, new Date())),
      )).limit(1);
      if (!item) {
        const counts = await countRun(run.id);
        const totals = { processed: counts.processed, changed: counts.changed, skipped: counts.skipped, failed: counts.failed };
        if (counts.pending > 0) {
          await db.update(runs).set({ status: "queued", leaseUntil: null, ...totals, updatedAt: new Date() }).where(and(eq(runs.id, run.id), eq(runs.status, "running")));
        } else {
          await db.update(runs).set({ status: counts.failed ? "failed" : "complete", leaseUntil: null, ...totals, updatedAt: new Date() }).where(and(eq(runs.id, run.id), eq(runs.status, "running")));
        }
        return;
      }
      await processMessage(run, item, token, owner.email, key);
    }
    const counts = await countRun(run.id);
    await db.update(runs).set({ status: "queued", leaseUntil: null, processed: counts.processed, changed: counts.changed, skipped: counts.skipped, failed: counts.failed, updatedAt: new Date() })
      .where(and(eq(runs.id, run.id), eq(runs.status, "running")));
  } catch (error) {
    const status = error instanceof GmailError ? error.status : (error as { statusCode?: number })?.statusCode;
    const pause = status === 401 || status === 403;
    const reason = error instanceof GmailError ? "Reconnect Google" : "Replace your TypeSafe API key";
    await db.update(runs).set({ status: pause ? "paused" : "failed", error: pause ? reason : "Processing failed; retry the run", leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(runs.id, run.id), eq(runs.status, "running")));
    if (pause) await db.update(settings).set({ pauseReason: reason }).where(eq(settings.userId, run.userId));
  } finally {
    clearInterval(heartbeat);
  }
}

export async function workerTick() {
  await scheduleDue();
  const run = await claimRun();
  if (run) await execute(run);
}
