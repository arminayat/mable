import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";

const mock = vi.hoisted(() => ({ session: vi.fn(), labels: vi.fn(), token: vi.fn() }));
vi.mock("../../src/lib/auth", () => ({ auth: { api: { getSession: mock.session } } }));
vi.mock("../../src/lib/gmail", () => ({
  GmailError: class extends Error {}, labels: mock.labels, googleToken: mock.token, createLabel: vi.fn(),
}));

import { GET, POST } from "../../src/app/api/mable/route";
import { db, pool } from "../../src/lib/db";
import { encrypt } from "../../src/lib/crypto";
import { createRun } from "../../src/lib/runs";
import * as runService from "../../src/lib/runs";
import { scheduleDue } from "../../src/lib/scheduler";
import { mailbox, rules, runs, settings, user } from "../../src/lib/schema";

const hour = 60 * 60_000;
const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3014").origin;

async function setup() {
  const userId = crypto.randomUUID();
  const now = new Date();
  await db.insert(user).values({ id: userId, name: "Schedule test", email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(settings).values({ userId, keyCipher: encrypt("test-scheduler-key"), threshold: 95 });
  await db.insert(mailbox).values({ userId });
  await db.insert(rules).values({ id: crypto.randomUUID(), userId, position: 0, question: "Is this a receipt?", actions: { star: true } });
  mock.session.mockResolvedValue({ user: { id: userId } });
  return userId;
}

function post(payload: Record<string, unknown>, requestOrigin = origin) {
  return POST(new Request(`${origin}/api/mable`, {
    method: "POST", headers: { origin: requestOrigin, "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }));
}
async function config(userId: string) {
  return (await db.select().from(settings).where(eq(settings.userId, userId)))[0];
}
async function makeDue(userId: string) {
  await db.update(settings).set({ schedule: "1h", nextRunAt: new Date(Date.now() - hour) }).where(eq(settings.userId, userId));
}

beforeEach(async () => {
  if (!process.env.DATABASE_URL || !process.env.CREDENTIAL_ENCRYPTION_KEY) throw new Error("Use a disposable migrated database and test encryption key");
  await db.delete(user);
  vi.clearAllMocks();
  mock.session.mockResolvedValue(null);
  mock.labels.mockResolvedValue([]);
  mock.token.mockResolvedValue("test-token");
});
afterAll(async () => { await db.delete(user); await pool.end(); });

describe("schedule preferences", () => {
  it.each([["15m", 15 * 60_000], ["1h", hour], ["24h", 24 * hour]] as const)("persists %s and returns its next check without changing the threshold", async (schedule, interval) => {
    const other = await setup();
    const userId = await setup();
    const before = Date.now();
    expect((await post({ type: "schedule.update", schedule })).status).toBe(200);
    const saved = await config(userId);
    expect(saved).toMatchObject({ schedule, threshold: 95 });
    expect(saved.nextRunAt!.getTime()).toBeGreaterThanOrEqual(before + interval);
    expect(saved.nextRunAt!.getTime()).toBeLessThanOrEqual(Date.now() + interval);
    expect((await config(other)).schedule).toBe("off");
    const response = await GET(new Request(`${origin}/api/mable`));
    const view = await response.json();
    expect(view.settings).toMatchObject({ schedule, nextRunAt: saved.nextRunAt!.toISOString() });
    expect(view.settings).not.toHaveProperty("keyCipher");
  });

  it("preserves the deadline when saving the same schedule or only the threshold", async () => {
    const userId = await setup();
    await makeDue(userId);
    const due = (await config(userId)).nextRunAt;
    await post({ type: "settings.update", threshold: 80 });
    await post({ type: "settings.update", threshold: 85, schedule: "1h" });
    await post({ type: "schedule.update", schedule: "1h" });
    expect(await config(userId)).toMatchObject({ schedule: "1h", threshold: 85, nextRunAt: due });
  });

  it("starts a new interval when changed and disables future runs without cancelling current work", async () => {
    const userId = await setup();
    await makeDue(userId);
    const before = Date.now();
    await post({ type: "schedule.update", schedule: "15m" });
    expect((await config(userId)).nextRunAt!.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
    const run = await createRun(userId, "new");
    await post({ type: "schedule.update", schedule: "off" });
    await scheduleDue();
    expect(await config(userId)).toMatchObject({ schedule: "off", nextRunAt: null });
    expect(await db.select().from(runs)).toMatchObject([{ id: run.id, status: "queued" }]);
  });

  it("requires a session, matching origin and a supported interval", async () => {
    expect((await post({ type: "schedule.update", schedule: "1h" })).status).toBe(401);
    const userId = await setup();
    expect((await post({ type: "schedule.update", schedule: "1h" }, "https://elsewhere.example")).status).toBe(403);
    expect((await post({ type: "schedule.update", schedule: "1s" })).status).toBe(400);
    expect((await post({ type: "schedule.update" })).status).toBe(400);
    expect(await config(userId)).toMatchObject({ schedule: "off", nextRunAt: null });
  });

  it("saves a schedule before setup and keeps other preference defaults", async () => {
    const userId = await setup();
    await db.delete(settings).where(eq(settings.userId, userId));
    expect((await post({ type: "schedule.update", schedule: "1h" })).status).toBe(200);
    expect(await config(userId)).toMatchObject({ schedule: "1h", threshold: 90, keyCipher: null });
  });
});

describe("durable schedules", () => {
  it("keeps a due check retryable after an unexpected queue failure", async () => {
    const userId = await setup();
    await makeDue(userId);
    const due = (await config(userId)).nextRunAt;
    const queue = vi.spyOn(runService, "queueRun").mockRejectedValueOnce(new Error("Database unavailable"));
    try { await expect(scheduleDue()).rejects.toThrow("Database unavailable"); }
    finally { queue.mockRestore(); }
    expect((await config(userId)).nextRunAt).toEqual(due);
    expect(await db.select().from(runs)).toHaveLength(0);
    await scheduleDue();
    expect(await db.select().from(runs)).toHaveLength(1);
  });

  it("queues one new-mail snapshot when due, advances one interval and does not catch up missed intervals", async () => {
    const userId = await setup();
    await makeDue(userId);
    const before = Date.now();
    await Promise.all([scheduleDue(), scheduleDue()]);
    await scheduleDue();
    const queued = await db.select().from(runs);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ userId, scope: "new", status: "queued", threshold: 95, rulesSnapshot: [{ question: "Is this a receipt?", actions: { star: true } }] });
    expect((await config(userId)).nextRunAt!.getTime()).toBeGreaterThanOrEqual(before + hour);
    expect((await config(userId)).nextRunAt!.getTime()).toBeLessThanOrEqual(Date.now() + hour);
  });

  it.each(["off", "future", "paused"])("does not schedule %s accounts", async (state) => {
    const userId = await setup();
    await makeDue(userId);
    if (state === "off") await post({ type: "schedule.update", schedule: "off" });
    if (state === "future") await db.update(settings).set({ nextRunAt: new Date(Date.now() + hour) }).where(eq(settings.userId, userId));
    if (state === "paused") await db.update(settings).set({ pauseReason: "Reconnect Google" }).where(eq(settings.userId, userId));
    const before = await config(userId);
    await scheduleDue();
    expect(await db.select().from(runs)).toHaveLength(0);
    expect((await config(userId)).nextRunAt).toEqual(before.nextRunAt);
  });

  it.each(["queued", "running", "failed", "paused"] as const)("does not overlap an existing %s run", async (status) => {
    const userId = await setup();
    const run = await createRun(userId, "all");
    await db.update(runs).set({ status }).where(eq(runs.id, run.id));
    await makeDue(userId);
    await scheduleDue();
    expect(await db.select().from(runs)).toHaveLength(1);
    expect((await config(userId)).nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it.each(["key", "question"])("waits until the next interval when the %s is missing", async (missing) => {
    const userId = await setup();
    await makeDue(userId);
    if (missing === "key") await db.update(settings).set({ keyCipher: null }).where(eq(settings.userId, userId));
    else await db.update(rules).set({ enabled: false }).where(eq(rules.userId, userId));
    await scheduleDue();
    expect(await db.select().from(runs)).toHaveLength(0);
    expect((await config(userId)).nextRunAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("rechecks a schedule disabled while a due tick waits for the user lock", async () => {
    const userId = await setup();
    await makeDue(userId);
    let tick: Promise<void> | undefined;
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      tick = scheduleDue();
      // Wait for evidence that the tick selected this account and is blocked.
      await vi.waitFor(async () => {
        const waiting = await pool.query("select 1 from pg_locks where locktype = 'advisory' and not granted");
        expect(waiting.rowCount).toBeGreaterThan(0);
      });
      await tx.update(settings).set({ schedule: "off", nextRunAt: null }).where(eq(settings.userId, userId));
    });
    await tick;
    expect(await db.select().from(runs)).toHaveLength(0);
    expect(await config(userId)).toMatchObject({ schedule: "off", nextRunAt: null });
  });
});
