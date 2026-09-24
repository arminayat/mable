import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/auth", () => ({ auth: { api: {} } }));
vi.mock("../src/lib/db", () => ({ db: {} }));
import { addedSince, applyActions, contextOf, GmailError, inboxIds } from "../src/lib/gmail";

afterEach(() => vi.unstubAllGlobals());

describe("Gmail boundary", () => {
  it("snapshots every inbox page before actions change the inbox", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "first" }], nextPageToken: "next" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ messages: [{ id: "second" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await inboxIds("token", 12345)).toEqual(["first", "second"]);
    expect(fetcher.mock.calls[0][0]).toContain("after%3A12345");
    expect(fetcher.mock.calls[1][0]).toContain("pageToken=next");
  });
  it("reads all history pages and preserves the final checkpoint", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ history: [{ messagesAdded: [{ message: { id: "a" } }] }], nextPageToken: "2", historyId: "11" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ history: [{ messagesAdded: [{ message: { id: "a" } }, { message: { id: "b" } }] }], historyId: "12" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await addedSince("token", "10")).toEqual({ ids: ["a", "b"], historyId: "12" });
  });
  it("uses one message modification for combined actions", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await applyActions("token", "abc", { label: "Label_1", star: true, read: true, archive: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ addLabelIds: ["Label_1", "STARRED"], removeLabelIds: ["UNREAD", "INBOX"] });
  });
  it("extracts text without attachments or remote content", () => {
    const text = Buffer.from("hello world").toString("base64url");
    const mail = { id: "abc", payload: { headers: [{ name: "Subject", value: "Hello" }], parts: [
      { mimeType: "text/plain", body: { data: text } },
      { mimeType: "application/pdf", body: { data: Buffer.from("private").toString("base64url") } },
    ] } };
    const result = contextOf(mail, "person@example.com");
    expect(result.body).toBe("hello world");
    expect(result.body).not.toContain("private");
    expect(result.owner).toBe("person@example.com");
  });
  it("distinguishes expired history from rate limits", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { errors: [{ reason: "userRateLimitExceeded" }] } }), { status: 403 })));
    await expect(addedSince("token", "10")).rejects.toMatchObject({ status: 404 });
    await expect(inboxIds("token")).rejects.toMatchObject({ status: 429 });
    expect(new GmailError(401).message).toContain("reconnection");
  });
});
