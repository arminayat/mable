import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { PublicError } from "./errors";
import { mailbox, rules, runs, settings, runMessages, type RunScope, type RuleSnapshot } from "./schema";

export async function createRun(userId: string, scope: RunScope) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [active] = await tx.select({ id: runs.id }).from(runs).where(and(
      eq(runs.userId, userId), inArray(runs.status, ["queued", "running"]),
    )).limit(1);
    if (active) throw new PublicError("A run is already active");
    const [unfinished] = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.userId, userId), inArray(runs.status, ["failed", "paused"]))).limit(1);
    if (unfinished) throw new PublicError("Retry or discard the previous run first");
    const [config] = await tx.select().from(settings).where(eq(settings.userId, userId)).limit(1);
    if (!config?.keyCipher) throw new PublicError("Add your AI API key first");
    const ordered = await tx.select().from(rules).where(and(eq(rules.userId, userId), eq(rules.enabled, true))).orderBy(asc(rules.position));
    if (!ordered.length) throw new PublicError("Add an enabled question first");
    const snapshot: RuleSnapshot[] = ordered.map(({ id, question, actions }) => ({ id, question, actions }));
    const [run] = await tx.insert(runs).values({ id: crypto.randomUUID(), userId, scope, rulesSnapshot: snapshot, threshold: config.threshold }).returning();
    return run;
  });
}

export async function cancelRun(userId: string, id: string) {
  return db.transaction(async (tx) => {
    const [run] = await tx.update(runs).set({ status: "cancelled", leaseUntil: null, updatedAt: new Date() })
      .where(and(eq(runs.id, id), eq(runs.userId, userId), inArray(runs.status, ["queued", "running", "paused", "failed"]))).returning();
    if (!run) throw new PublicError("Run cannot be cancelled");
    if (run.scope === "new") await tx.update(mailbox).set({ historyId: null }).where(eq(mailbox.userId, userId));
    return run;
  });
}

export async function retryRun(userId: string, id: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    const [run] = await tx.select().from(runs).where(and(eq(runs.id, id), eq(runs.userId, userId))).limit(1);
    if (!run || !["failed", "paused"].includes(run.status)) throw new PublicError("Run cannot be retried");
    const [active] = await tx.select({ id: runs.id }).from(runs).where(and(eq(runs.userId, userId), inArray(runs.status, ["queued", "running"]))).limit(1);
    if (active) throw new PublicError("A run is already active");
    await tx.update(runMessages).set({ state: "pending", phase: "waiting", attempts: 0, nextAttemptAt: null }).where(and(eq(runMessages.runId, id), eq(runMessages.state, "failed")));
    const [updated] = await tx.update(runs).set({ status: "queued", error: null, failed: 0, leaseUntil: null, updatedAt: new Date() }).where(eq(runs.id, id)).returning();
    return updated;
  });
}
