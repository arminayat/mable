import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mock = vi.hoisted(() => ({
  session: vi.fn(), labels: vi.fn(), token: vi.fn(), inbox: vi.fn(), history: vi.fn(), profile: vi.fn(), message: vi.fn(), apply: vi.fn(), decide: vi.fn(), preview: vi.fn(),
}));
vi.mock("../../src/lib/auth", () => ({ auth: { api: { getSession: mock.session } } }));
vi.mock("../../src/lib/gmail", () => ({
  GmailError: class GmailError extends Error { constructor(public status: number) { super("Gmail error"); } },
  labels: mock.labels, googleToken: mock.token, inboxIds: mock.inbox, addedSince: mock.history, profile: mock.profile,
  message: mock.message, applyActions: mock.apply, preview: mock.preview,
  contextOf: () => ({ owner: "owner@example.com", from: "", to: "", date: "", subject: "", body: "" }),
}));
vi.mock("../../src/lib/decide", () => ({ decide: mock.decide }));

import { db, pool } from "../../src/lib/db";
import { GET, POST } from "../../src/app/api/mable/route";
import { GET as streamProgress } from "../../src/app/api/mable/runs/[id]/events/route";
import { GET as emailPreview } from "../../src/app/api/mable/runs/[id]/messages/[messageId]/route";
import { getRunProgress } from "../../src/lib/run-progress";
import type { RunProgress } from "../../src/lib/run-progress-types";
import { decrypt, encrypt } from "../../src/lib/crypto";
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
  mock.session.mockResolvedValue(null);
  mock.preview.mockResolvedValue({ subject: "Build passed", from: "bot@example.com", excerpt: "Pipeline passed on main." });
  mock.labels.mockResolvedValue([]);
  mock.token.mockResolvedValue("google-token");
  mock.inbox.mockResolvedValue([]);
  mock.history.mockResolvedValue({ ids: [], historyId: "501" });
  mock.profile.mockResolvedValue({ historyId: "500" });
  mock.message.mockImplementation(async (_token: string, id: string) => ({ id, labelIds: ["INBOX", "UNREAD"] }));
  mock.apply.mockResolvedValue(undefined);
  mock.decide.mockResolvedValue({ index: 0, probabilities: [0.97] });
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

  it("accepts the latest-50 scope through the API and processes its bounded snapshot", async () => {
    const userId = await setup();
    mock.session.mockResolvedValue({ user: { id: userId } });
    const messages = Array.from({ length: 50 }, (_, index) => `mail-${index}`);
    mock.inbox.mockResolvedValue(messages);
    await db.update(mailbox).set({ historyId: "unchanged" }).where(eq(mailbox.userId, userId));
    await db.insert(newMailSeen).values({ userId, messageId: messages[0] });
    const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3014").origin;
    const response = await POST(new Request(`${origin}/api/mable`, {
      method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ type: "run.create", scope: "latest" }),
    }));
    expect(response.status).toBe(200);
    const run = await response.json();
    expect(run.scope).toBe("latest");
    for (let batch = 0; batch < 3; batch++) await workerTick();
    expect(mock.inbox).toHaveBeenCalledExactlyOnceWith("google-token", undefined, 50);
    expect(mock.history).not.toHaveBeenCalled();
    expect((await getRunProgress(userId, run.id))).toMatchObject({ status: "complete", total: 50, processed: 50 });
    expect(mock.apply).toHaveBeenCalledTimes(50);
    expect(mock.apply).toHaveBeenCalledWith("google-token", messages[0], expect.any(Object));
    expect((await db.select().from(mailbox).where(eq(mailbox.userId, userId)))[0].historyId).toBe("unchanged");
    expect(await db.select().from(newMailSeen).where(eq(newMailSeen.userId, userId))).toHaveLength(1);
  });

  it("reuses the latest-50 snapshot after discovery was interrupted", async () => {
    const userId = await setup();
    const run = await createRun(userId, "latest");
    await db.insert(runMessages).values(Array.from({ length: 50 }, (_, position) => ({
      id: crypto.randomUUID(), runId: run.id, messageId: `snapshot-${position}`, position,
    })));
    mock.inbox.mockResolvedValue(["new-arrival"]);
    for (let batch = 0; batch < 3; batch++) await workerTick();
    expect(mock.inbox).not.toHaveBeenCalled();
    expect((await getRunProgress(userId, run.id))).toMatchObject({ status: "complete", total: 50 });
    expect(mock.apply).not.toHaveBeenCalledWith("google-token", "new-arrival", expect.any(Object));
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
    mock.decide.mockResolvedValue({ index: 0, probabilities: [0.97] });
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


describe("AI provider credentials", () => {
  async function post(userId: string, payload: Record<string, unknown>) {
    mock.session.mockResolvedValue({ user: { id: userId } });
    const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3014").origin;
    return POST(new Request(`${origin}/api/mable`, {
      method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }));
  }

  it("encrypts Gateway credentials, exposes only their provider, and routes worker evaluation", async () => {
    const userId = await setup();
    const other = await setup();
    expect((await post(userId, { type: "key.set", provider: "vercel", key: "vck_gateway-test-key" })).status).toBe(200);
    const [config] = await db.select().from(settings).where(eq(settings.userId, userId));
    expect(config.keyProvider).toBe("vercel");
    expect(config.keyCipher).not.toContain("vck_gateway-test-key");
    expect(decrypt(config.keyCipher!)).toBe("vck_gateway-test-key");
    expect((await db.select().from(settings).where(eq(settings.userId, other)))[0].keyProvider).toBe("typesafe");
    const response = await GET(new Request("http://localhost:3014/api/mable"));
    const view = await response.json();
    expect(view.settings).toMatchObject({ hasKey: true, keyProvider: "vercel" });
    expect(JSON.stringify(view)).not.toContain(config.keyCipher);
    expect(JSON.stringify(view)).not.toContain("vck_gateway-test-key");
    mock.inbox.mockResolvedValue(["message"]);
    await createRun(userId, "all");
    await workerTick();
    expect(mock.decide).toHaveBeenCalledWith(expect.any(Object), expect.any(Array), 90, "vck_gateway-test-key", "vercel");
    expect(mock.apply).toHaveBeenCalledTimes(1);
  });

  it("detects the key regardless of a stale client provider field", async () => {
    const userId = await setup();
    await post(userId, { type: "key.set", provider: "typesafe", key: "vck_gateway-test-key" });
    const [gateway] = await db.select().from(settings).where(eq(settings.userId, userId));
    expect(gateway.keyProvider).toBe("vercel");
    await post(userId, { type: "key.set", provider: "vercel", key: "other-typesafe-key" });
    const [config] = await db.select().from(settings).where(eq(settings.userId, userId));
    expect(config.keyProvider).toBe("typesafe");
    expect(decrypt(config.keyCipher!)).toBe("other-typesafe-key");
  });

  it("removes a Gateway key and turns off scheduled cleanup", async () => {
    const userId = await setup();
    await post(userId, { type: "key.set", provider: "vercel", key: "vck_gateway-test-key" });
    await post(userId, { type: "settings.update", threshold: 90, schedule: "15m" });
    expect((await post(userId, { type: "key.remove" })).status).toBe(200);
    expect((await db.select().from(settings).where(eq(settings.userId, userId)))[0]).toMatchObject({ keyCipher: null, schedule: "off", nextRunAt: null });
    await expect(createRun(userId, "all")).rejects.toThrow("Add your AI API key first");
  });

  it.each(["typesafe", "vercel"] as const)("pauses on a revoked %s key and resumes with its replacement", async (provider) => {
    const userId = await setup();
    await post(userId, { type: "key.set", key: provider === "vercel" ? "vck_revoked-test-key" : "revoked-test-key" });
    mock.inbox.mockResolvedValue(["message"]);
    mock.decide.mockRejectedValueOnce(Object.assign(new Error("Unauthorized"), { statusCode: 401 }));
    const run = await createRun(userId, "all");
    await workerTick();
    expect(mock.apply).not.toHaveBeenCalled();
    const reason = `Replace your ${provider === "vercel" ? "Vercel AI Gateway" : "TypeSafe"} API key`;
    expect((await db.select().from(runs).where(eq(runs.id, run.id)))[0]).toMatchObject({ status: "paused", error: reason });
    expect((await db.select().from(settings).where(eq(settings.userId, userId)))[0].pauseReason).toBe(reason);
    await post(userId, { type: "key.set", key: provider === "vercel" ? "vck_replacement-test-key" : "replacement-test-key" });
    expect((await db.select().from(settings).where(eq(settings.userId, userId)))[0].pauseReason).toBeNull();
    await retryRun(userId, run.id);
    await workerTick();
    expect(mock.decide).toHaveBeenLastCalledWith(expect.any(Object), expect.any(Array), 90, provider === "vercel" ? "vck_replacement-test-key" : "replacement-test-key", provider);
    expect(mock.apply).toHaveBeenCalledTimes(1);
  });
});

describe("live run review", () => {
  function streamRequest(id: string, page = "") {
    return streamProgress(new Request(`http://localhost:3014/api/mable/runs/${id}/events${page}`), { params: Promise.resolve({ id }) });
  }
  function previewRequest(id: string, messageId: string) {
    return emailPreview(new Request(`http://localhost:3014/api/mable/runs/${id}/messages/${messageId}`), { params: Promise.resolve({ id, messageId }) });
  }
  async function nextSnapshot(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<RunProgress | undefined> {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      const chunk = new TextDecoder().decode(value);
      if (chunk.startsWith("event: progress")) return JSON.parse(chunk.split("data: ")[1]);
    }
  }

  it("streams actual evaluation progress, then persisted results and terminal counts", async () => {
    const userId = await setup();
    mock.session.mockResolvedValue({ user: { id: userId } });
    mock.inbox.mockResolvedValue(["first", "second"]);
    let finishEvaluation!: (value: { index: number; probabilities: number[] }) => void;
    let enteredEvaluation!: () => void;
    const evaluating = new Promise<void>((resolve) => { enteredEvaluation = resolve; });
    mock.decide.mockImplementationOnce(() => {
      enteredEvaluation();
      return new Promise((resolve) => { finishEvaluation = resolve; });
    });
    mock.decide.mockResolvedValueOnce({ index: -1, probabilities: [0.2] });
    const run = await createRun(userId, "all");
    const response = await streamRequest(run.id);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const reader = response.body!.getReader();
    expect(await nextSnapshot(reader)).toMatchObject({ status: "queued", processed: 0, total: 0, discovered: false });
    const tick = workerTick();
    try {
      await evaluating;
      expect(await nextSnapshot(reader)).toMatchObject({ status: "running", processed: 0, total: 2, discovered: true, items: [
        { messageId: "first", phase: "evaluating", probabilities: null }, { messageId: "second", phase: "waiting" },
      ] });
      expect(mock.apply).not.toHaveBeenCalled();
    } finally { finishEvaluation({ index: 0, probabilities: [0.98] }); }
    await tick;
    expect(await nextSnapshot(reader)).toMatchObject({ status: "complete", processed: 2, changed: 1, skipped: 1, items: [
      { messageId: "first", position: 0, phase: "done", probabilities: [0.98], actions: { star: true, archive: true } },
      { messageId: "second", position: 1, phase: "no_match", probabilities: [0.2], actions: null },
    ] });
    expect(await reader.read()).toMatchObject({ done: true });
    expect(mock.apply).toHaveBeenCalledTimes(1);
    const replay = await streamRequest(run.id);
    const replayText = await replay.text();
    expect(replayText).toContain('"probabilities":[0.98]');
    expect(replayText).not.toContain("google-token");
    expect(replayText).not.toContain("tsk_testing_only");
  }, 10_000);

  it("pages every result and follows activity without replacing a user's review page", async () => {
    const userId = await setup();
    mock.inbox.mockResolvedValue(Array.from({ length: 25 }, (_, i) => `mail-${i}`));
    const run = await createRun(userId, "all");
    await workerTick();
    const first = await getRunProgress(userId, run.id, 0);
    expect(first).toMatchObject({ total: 25, processed: 20, page: 0, pageCount: 2 });
    expect(first?.items).toHaveLength(20);
    await workerTick();
    const live = await getRunProgress(userId, run.id);
    expect(live).toMatchObject({ page: 1, processed: 25 });
    expect(live?.items.map((item) => item.messageId)).toEqual(["mail-20", "mail-21", "mail-22", "mail-23", "mail-24"]);
    expect((await getRunProgress(userId, run.id, 0))?.items[0].messageId).toBe("mail-0");
    expect((await getRunProgress(userId, run.id, 999))?.page).toBe(1);
    await db.update(rules).set({ question: "Edited later" }).where(eq(rules.userId, userId));
    expect((await getRunProgress(userId, run.id))?.rules[0].question).toBe("Is this GitHub mail?");
  });

  it("requires a session and isolates streams and Gmail previews by run ownership", async () => {
    const owner = await setup();
    const other = await setup();
    mock.inbox.mockResolvedValue(["private-email"]);
    const run = await createRun(owner, "all");
    await workerTick();
    expect((await streamRequest(run.id)).status).toBe(401);
    expect((await previewRequest(run.id, "private-email")).status).toBe(401);
    mock.session.mockResolvedValue({ user: { id: other } });
    expect(await getRunProgress(other, run.id)).toBeNull();
    expect((await streamRequest(run.id)).status).toBe(404);
    expect((await previewRequest(run.id, "private-email")).status).toBe(404);
    mock.session.mockResolvedValue({ user: { id: owner } });
    expect((await previewRequest(run.id, "not-in-this-run")).status).toBe(404);
    expect((await streamRequest(run.id, "?page=-1")).status).toBe(400);
    expect((await streamRequest(run.id, "?page=1.1")).status).toBe(400);
    expect(mock.preview).not.toHaveBeenCalled();
  });

  it("loads previews only from Gmail without persisting email content", async () => {
    const owner = await setup();
    mock.inbox.mockResolvedValue(["private-email"]);
    const run = await createRun(owner, "all");
    await workerTick();
    mock.session.mockResolvedValue({ user: { id: owner } });
    const response = await previewRequest(run.id, "private-email");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ subject: "Build passed", excerpt: "Pipeline passed on main." });
    expect(mock.preview).toHaveBeenCalledWith("google-token", "private-email", expect.any(AbortSignal));
    const persisted = JSON.stringify(await db.select().from(runMessages).where(eq(runMessages.runId, run.id)));
    expect(persisted).not.toContain("Build passed");
    expect(persisted).not.toContain("Pipeline passed");
    mock.preview.mockRejectedValueOnce(new GmailError(404));
    expect(await (await previewRequest(run.id, "private-email")).json()).toEqual({ error: "Email no longer available in Gmail" });
  });

  it("retains scores and actions across a failed mutation and retry", async () => {
    const owner = await setup();
    mock.inbox.mockResolvedValue(["message"]);
    mock.apply.mockRejectedValueOnce(new Error("Connection dropped"));
    const run = await createRun(owner, "all");
    await workerTick();
    expect((await getRunProgress(owner, run.id))?.items[0]).toMatchObject({ state: "decided", phase: "retrying", probabilities: [0.97], actions: { star: true, archive: true } });
    await db.update(runMessages).set({ nextAttemptAt: new Date(0) }).where(eq(runMessages.runId, run.id));
    await workerTick();
    expect(mock.decide).toHaveBeenCalledTimes(1);
    expect((await getRunProgress(owner, run.id))?.items[0]).toMatchObject({ state: "done", probabilities: [0.97] });
  });

  it("closes a cancelled stream and stops reading after the client disconnects", async () => {
    const owner = await setup();
    mock.session.mockResolvedValue({ user: { id: owner } });
    const run = await createRun(owner, "all");
    const response = await streamRequest(run.id);
    const reader = response.body!.getReader();
    expect(await nextSnapshot(reader)).toMatchObject({ status: "queued" });
    await reader.cancel();
    await cancelRun(owner, run.id);
    expect(await (await streamRequest(run.id)).text()).toContain('"status":"cancelled"');
  });

  it("keeps review positions dense when discovery restarts with duplicate or reordered IDs", async () => {
    const owner = await setup();
    const run = await createRun(owner, "all");
    await db.insert(runMessages).values({ id: crypto.randomUUID(), runId: run.id, messageId: "existing", position: 0 });
    mock.inbox.mockResolvedValue(["new", "existing", "new", "last"]);
    await workerTick();
    const progress = await getRunProgress(owner, run.id);
    expect(progress).toMatchObject({ total: 3, processed: 3 });
    expect(progress?.items.map(({ messageId, position }) => [messageId, position])).toEqual([["existing", 0], ["new", 1], ["last", 2]]);
  });
});
