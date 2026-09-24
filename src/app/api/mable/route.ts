import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { PublicError } from "@/lib/errors";
import { createLabel, GmailError, googleToken, labels } from "@/lib/gmail";
import { cancelRun, createRun, retryRun } from "@/lib/runs";
import { mailbox, rules, runs, settings, user } from "@/lib/schema";

const actions = z.object({ label: z.string().min(1).optional(), star: z.literal(true).optional(), read: z.literal(true).optional(), archive: z.literal(true).optional() })
  .refine((value) => Object.values(value).some(Boolean), "Choose at least one action");
const schedule = z.enum(["off", "15m", "1h", "24h"]);
const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rule.create"), question: z.string().trim().min(3).max(500), actions, enabled: z.boolean() }),
  z.object({ type: z.literal("rule.update"), id: z.string(), question: z.string().trim().min(3).max(500), actions, enabled: z.boolean() }),
  z.object({ type: z.literal("rule.delete"), id: z.string() }),
  z.object({ type: z.literal("rule.reorder"), ids: z.array(z.string()) }),
  z.object({ type: z.literal("settings.update"), threshold: z.number().int().min(50).max(100), schedule }),
  z.object({ type: z.literal("key.set"), key: z.string().trim().min(10).max(500) }),
  z.object({ type: z.literal("key.remove") }),
  z.object({ type: z.literal("label.create"), name: z.string().trim().min(1).max(225) }),
  z.object({ type: z.literal("run.create"), scope: z.enum(["new", "recent", "all"]) }),
  z.object({ type: z.literal("run.cancel"), id: z.string() }),
  z.object({ type: z.literal("run.retry"), id: z.string() }),
  z.object({ type: z.literal("account.delete") }),
]);

async function identity(request: Request) {
  const result = await auth.api.getSession({ headers: request.headers });
  return result?.user.id;
}

export async function GET(request: Request) {
  const userId = await identity(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const [config, ordered, latest, connected] = await Promise.all([
    db.select().from(settings).where(eq(settings.userId, userId)).limit(1),
    db.select().from(rules).where(eq(rules.userId, userId)).orderBy(asc(rules.position)),
    db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.createdAt)).limit(1),
    db.select().from(mailbox).where(eq(mailbox.userId, userId)).limit(1),
  ]);
  let gmailLabels: { id: string; name: string }[] = [];
  let gmailConnected = !!connected.length;
  let pauseReason = config[0]?.pauseReason ?? null;
  try {
    gmailLabels = await labels(await googleToken(userId));
    if (!connected.length) {
      const [record] = await db.select({ createdAt: user.createdAt }).from(user).where(eq(user.id, userId)).limit(1);
      if (record) await db.insert(mailbox).values({ userId, connectedAt: record.createdAt }).onConflictDoNothing();
    }
    if (pauseReason === "Reconnect Google") {
      await db.update(settings).set({ pauseReason: null }).where(eq(settings.userId, userId));
      pauseReason = null;
    }
    gmailConnected = true;
  }
  catch (error) { if (error instanceof GmailError && [401, 403].includes(error.status)) gmailConnected = false; }
  return Response.json({
    rules: ordered,
    settings: { threshold: config[0]?.threshold ?? 90, schedule: config[0]?.schedule ?? "off", hasKey: !!config[0]?.keyCipher, pauseReason },
    run: latest[0] ?? null,
    labels: gmailLabels,
    gmailConnected,
  });
}

export async function POST(request: Request) {
  const userId = await identity(request);
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const expectedOrigin = new URL(process.env.BETTER_AUTH_URL ?? request.url).origin;
  if (request.headers.get("origin") !== expectedOrigin) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const parsed = command.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  const input = parsed.data;
  try {
    let result: unknown = { ok: true };
    if (input.type === "rule.create" || input.type === "rule.update") {
      if (input.actions.label) {
        const available = await labels(await googleToken(userId));
        if (!available.some((label) => label.id === input.actions.label)) throw new PublicError("Choose an existing Gmail label");
      }
      if (input.type === "rule.create") {
        result = await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
          const ordered = await tx.select({ position: rules.position }).from(rules).where(eq(rules.userId, userId)).orderBy(desc(rules.position)).limit(1);
          return tx.insert(rules).values({ id: crypto.randomUUID(), userId, position: (ordered[0]?.position ?? -1) + 1, question: input.question, actions: input.actions, enabled: input.enabled }).returning();
        });
      } else {
        const updated = await db.update(rules).set({ question: input.question, actions: input.actions, enabled: input.enabled })
          .where(and(eq(rules.id, input.id), eq(rules.userId, userId))).returning();
        if (!updated.length) throw new PublicError("Rule not found");
        result = updated[0];
      }
    } else if (input.type === "rule.delete") {
      await db.delete(rules).where(and(eq(rules.id, input.id), eq(rules.userId, userId)));
    } else if (input.type === "rule.reorder") {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
        const own = await tx.select({ id: rules.id }).from(rules).where(eq(rules.userId, userId));
        if (own.length !== input.ids.length || new Set(input.ids).size !== own.length || !own.every((rule) => input.ids.includes(rule.id))) throw new PublicError("Invalid rule order");
        for (let index = 0; index < input.ids.length; index++) await tx.update(rules).set({ position: index }).where(and(eq(rules.id, input.ids[index]), eq(rules.userId, userId)));
      });
    } else if (input.type === "settings.update") {
      const minutes = { off: 0, "15m": 15, "1h": 60, "24h": 1440 }[input.schedule];
      const value = { threshold: input.threshold, schedule: input.schedule, nextRunAt: minutes ? new Date(Date.now() + minutes * 60_000) : null };
      await db.insert(settings).values({ userId, ...value }).onConflictDoUpdate({ target: settings.userId, set: value });
    } else if (input.type === "key.set") {
      const keyCipher = encrypt(input.key);
      await db.insert(settings).values({ userId, keyCipher, pauseReason: null })
        .onConflictDoUpdate({ target: settings.userId, set: { keyCipher, pauseReason: null } });
    } else if (input.type === "key.remove") {
      await db.insert(settings).values({ userId }).onConflictDoNothing();
      await db.update(settings).set({ keyCipher: null, schedule: "off", nextRunAt: null }).where(eq(settings.userId, userId));
    } else if (input.type === "label.create") {
      result = await createLabel(await googleToken(userId), input.name);
    } else if (input.type === "run.create") {
      result = await createRun(userId, input.scope);
    } else if (input.type === "run.cancel") {
      result = await cancelRun(userId, input.id);
    } else if (input.type === "run.retry") {
      result = await retryRun(userId, input.id);
    } else if (input.type === "account.delete") {
      try {
        const token = await googleToken(userId);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", signal: AbortSignal.timeout(5000) });
      } catch { /* Local deletion still proceeds when Google is unavailable. */ }
      await db.delete(user).where(eq(user.id, userId));
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof GmailError || error instanceof PublicError ? error.message : "Request failed";
    return Response.json({ error: message }, { status: error instanceof GmailError ? error.status : 400 });
  }
}
