import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mock = vi.hoisted(() => ({
  token: vi.fn(), inbox: vi.fn(), history: vi.fn(), profile: vi.fn(), message: vi.fn(), apply: vi.fn(), decide: vi.fn(),
}));
vi.mock("../../src/lib/gmail", () => ({
  GmailError: class GmailError extends Error { constructor(public status: number) { super("Gmail error"); } },
  googleToken: mock.token, inboxIds: mock.inbox, addedSince: mock.history, profile: mock.profile,
  message: mock.message, applyActions: mock.apply,
  contextOf: () => ({ owner: "owner@example.com", from: "", to: "", date: "", subject: "", body: "" }),
}));
vi.mock("../../src/lib/decide", () => ({ decide: mock.decide }));

import { db, pool } from "../../src/lib/db";
import { encrypt } from "../../src/lib/crypto";
import { createRun, cancelRun, retryRun } from "../../src/lib/runs";
import { workerTick } from "../../src/lib/worker";
import { GmailError } from "../../src/lib/gmail";
import { mailbox, newMailSeen, rules, runMessages, runs, settings, user } from "../../src/lib/schema";

async function setup(question = "Is this GitHub mail?") {
  const userId = crypto.randomUUID();
  const now = new Date();
  await db.insert(user).values({ id: userId, name: "Owner", email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  await db.insert(settings).values({ userId, keyCipher: encrypt("tsk_testing_only") });
  await db.insert(mailbox).values({ userId, historyId: null });
  await db.insert(rules).values({ id: crypto.randomUUID(), userId, position: 0, question, actions: { star: true, archive: true }, enabled: true });
  return userId;
}

beforeEach(async () => {
  if (!process.env.DATABASE_URL || !process.env.CREDENTIAL_ENCRYPTION_KEY) throw new Error("Integration test requires DATABASE_URL and CREDENTIAL_ENCRYPTION_KEY");
  await db.delete(user);
  vi.clearAllMocks();
  mock.token.mockResolvedValue("google-token");
  mock.inbox.mockResolvedValue([]);
  mock.history.mockResolvedValue({ ids: [], historyId: "501" });
  mock.profile.mockResolvedValue({ historyId: "500" });
  mock.message.mockImplementation(async (_token: string, id: string) => ({ id, labelIds: ["INBOX", "UNREAD"] }));
  mock.apply.mockResolvedValue(undefined);
  mock.decide.mockResolvedValue(0);
});
afterAll(async () => { await db.delete(user); await pool.end(); });

describe("durable worker", () => {
  it("snapshots all candidates and applies one action set per message", async () => {
    const userId = await setup();
    mock.inbox.mockResolvedValue(["first", "second"]);
    const run = await createRun(userId, "all");
    await workerTick();
    const [finished] = await db.select().from(runs).where(eq(runs.id, run.id));
    expect(finished.status).toBe("complete");
    expect([finished.processed, finished.changed, finished.skipped]).toEqual([2, 2, 0]);
    expect(mock.inbox).toHaveBeenCalledWith("google-token");
    expect(mock.apply).toHaveBeenCalledTimes(2);
    expect(mock.apply).toHaveBeenCalledWith("google-token", "first", { star: true, archive: true });
  });

  it("uses a 30-day cutoff for a recent run", async () => {
    const userId = await setup();
    await createRun(userId, "recent");
    await workerTick();
    const cutoff = mock.inbox.mock.calls[0][1];
    expect(typeof cutoff).toBe("number");
    expect(Math.abs(cutoff - Math.floor((Date.now() - 30 * 86400_000) / 1000))).toBeLessThan(3);
  });

  it("deduplicates new mail and advances history after discovery", async () => {
    const userId = await setup();
    mock.inbox.mockResolvedValue(["seen", "fresh"]);
    await db.insert(newMailSeen).values({ userId, messageId: "seen" });
    const run = await createRun(userId, "new");
    await workerTick();
    const [state] = await db.select().from(mailbox).where(eq(mailbox.userId, userId));
    const items = await db.select().from(runMessages).where(eq(runMessages.runId, run.id));
    expect(items.map((item) => item.messageId)).toEqual(["fresh"]);
    expect(state.historyId).toBe("500");
  });

  it("reconciles the inbox when Gmail history expires", async () => {
    const userId = await setup();
    await db.update(mailbox).set({ historyId: "expired" }).where(eq(mailbox.userId, userId));
    mock.history.mockRejectedValue(new GmailError(404));
    mock.inbox.mockResolvedValue(["recovered"]);
    const run = await createRun(userId, "new");
    await workerTick();
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("complete");
    expect(mock.inbox).toHaveBeenCalledTimes(1);
    expect(mock.apply).toHaveBeenCalledWith("google-token", "recovered", { star: true, archive: true });
  });

  it("serializes run creation for the same account", async () => {
    const userId = await setup();
    const attempts = await Promise.allSettled([createRun(userId, "new"), createRun(userId, "all")]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("reuses the saved decision after an uncertain Gmail modification", async () => {
    const userId = await setup();
    mock.inbox.mockResolvedValue(["message"]);
    mock.apply.mockRejectedValueOnce(new Error("Connection dropped after response"));
    const run = await createRun(userId, "all");
    await workerTick();
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("queued");
    await db.update(runMessages).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(runMessages.runId, run.id));
    await workerTick();
    expect(mock.decide).toHaveBeenCalledTimes(1);
    expect(mock.apply).toHaveBeenCalledTimes(2);
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("complete");
  });

  it("processes large runs in bounded batches and resumes them", async () => {
    const userId = await setup();
    mock.inbox.mockResolvedValue(Array.from({ length: 25 }, (_, index) => `message-${index}`));
    const run = await createRun(userId, "all");
    await workerTick();
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("queued");
    expect(mock.apply).toHaveBeenCalledTimes(20);
    await workerTick();
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("complete");
    expect(mock.apply).toHaveBeenCalledTimes(25);
  });

  it("fails closed after repeated model errors and succeeds on retry", async () => {
    const userId = await setup();
    mock.inbox.mockResolvedValue(["message"]);
    mock.decide.mockRejectedValue(new Error("Malformed model response"));
    const run = await createRun(userId, "all");
    for (let attempt = 0; attempt < 3; attempt++) {
      await workerTick();
      await db.update(runMessages).set({ nextAttemptAt: new Date(Date.now() - 1000) }).where(eq(runMessages.runId, run.id));
    }
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("failed");
    expect(mock.apply).not.toHaveBeenCalled();
    mock.decide.mockResolvedValue(0);
    await retryRun(userId, run.id);
    await workerTick();
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("complete");
    expect(mock.apply).toHaveBeenCalledTimes(1);
  });

  it("cancels without acting and resets new-mail reconciliation", async () => {
    const userId = await setup();
    await db.update(mailbox).set({ historyId: "before" }).where(eq(mailbox.userId, userId));
    const run = await createRun(userId, "new");
    await cancelRun(userId, run.id);
    await workerTick();
    expect(mock.apply).not.toHaveBeenCalled();
    expect((await db.select().from(mailbox).where(eq(mailbox.userId, userId)))[0].historyId).toBeNull();
  });

  it("pauses on revoked Google access", async () => {
    const userId = await setup();
    mock.token.mockRejectedValue(new GmailError(401));
    const run = await createRun(userId, "new");
    await workerTick();
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0].status).toBe("paused");
    expect((await db.select().from(settings).where(eq(settings.userId, userId)))[0].pauseReason).toBeTruthy();
  });

  it("keeps each user's rules and progress separate, then cascades deletion", async () => {
    const a = await setup("Question A");
    const b = await setup("Question B");
    const runA = await createRun(a, "all");
    const runB = await createRun(b, "all");
    expect(runA.rulesSnapshot[0].question).toBe("Question A");
    expect(runB.rulesSnapshot[0].question).toBe("Question B");
    await db.delete(user).where(eq(user.id, a));
    expect(await db.select().from(runs).where(eq(runs.userId, a))).toHaveLength(0);
    expect(await db.select().from(runs).where(eq(runs.userId, b))).toHaveLength(1);
  });
});
