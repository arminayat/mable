import { eq, and } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { account } from "./schema";
import type { MailContext, } from "./decide";
import type { RuleActions } from "./schema";

const base = "https://gmail.googleapis.com/gmail/v1/users/me";

export class GmailError extends Error {
  constructor(public status: number) { super(status === 401 || status === 403 ? "Google access needs reconnection" : `Gmail request failed (${status})`); }
}

export async function googleToken(userId: string) {
  const [linked] = await db.select({ id: account.id }).from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google"))).limit(1);
  if (!linked) throw new GmailError(401);
  let token: { accessToken: string } | null;
  try { token = await auth.api.getAccessToken({ body: { accountId: linked.id, userId } }); }
  catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 400 || status === 401 || status === 403) throw new GmailError(401);
    throw error;
  }
  if (!token?.accessToken) throw new GmailError(401);
  return token.accessToken;
}

export async function gmail<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { error?: { errors?: { reason?: string }[] } } | null;
    const reason = detail?.error?.errors?.[0]?.reason;
    const retryable = response.status === 403 && ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(reason ?? "");
    throw new GmailError(retryable ? 429 : response.status);
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

type GmailMessage = {
  id: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[]; mimeType?: string; body?: { data?: string }; parts?: GmailMessage["payload"][] };
};
type MessagePage = { messages?: { id: string }[]; nextPageToken?: string };
type HistoryPage = { history?: { messagesAdded?: { message?: { id: string } }[] }[]; nextPageToken?: string; historyId: string };
type Labels = { labels?: { id: string; name: string; type: string }[] };

export async function profile(token: string) { return gmail<{ historyId: string }>(token, "/profile"); }
export async function message(token: string, id: string) {
  return gmail<GmailMessage>(token, `/messages/${encodeURIComponent(id)}?format=full`);
}

export async function inboxIds(token: string, afterSeconds?: number) {
  const ids: string[] = [];
  let page: string | undefined;
  do {
    const query = new URLSearchParams({ maxResults: "500", labelIds: "INBOX" });
    if (afterSeconds) query.set("q", `after:${afterSeconds}`);
    if (page) query.set("pageToken", page);
    const result: MessagePage = await gmail(token, `/messages?${query}`);
    ids.push(...(result.messages ?? []).map((item) => item.id));
    page = result.nextPageToken;
  } while (page);
  return ids;
}

export async function addedSince(token: string, historyId: string) {
  const ids = new Set<string>();
  let page: string | undefined;
  let latest = historyId;
  do {
    const query = new URLSearchParams({ startHistoryId: historyId, historyTypes: "messageAdded", maxResults: "500" });
    if (page) query.set("pageToken", page);
    const result: HistoryPage = await gmail(token, `/history?${query}`);
    latest = result.historyId;
    for (const item of result.history ?? []) for (const added of item.messagesAdded ?? []) {
      if (added.message?.id) ids.add(added.message.id);
    }
    page = result.nextPageToken;
  } while (page);
  return { ids: [...ids], historyId: latest };
}

export async function labels(token: string) {
  const result = await gmail<Labels>(token, "/labels");
  return (result.labels ?? []).filter((label) => label.type === "user").map(({ id, name }) => ({ id, name }));
}

export async function createLabel(token: string, name: string) {
  const existing = (await labels(token)).find((label) => label.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing;
  const created = await gmail<{ id: string; name: string }>(token, "/labels", {
    method: "POST", body: JSON.stringify({ name, labelListVisibility: "labelShow", messageListVisibility: "show" }),
  });
  return { id: created.id, name: created.name };
}

function decode(value?: string) {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function bodyOf(part?: GmailMessage["payload"]): string {
  if (!part) return "";
  if (part.parts?.length) {
    const plain = part.parts.map(bodyOf).filter(Boolean);
    if (plain.length) return plain.join("\n");
  }
  if (part.mimeType === "text/plain") return decode(part.body?.data);
  if (part.mimeType === "text/html") return decode(part.body?.data).replace(/<[^>]+>/g, " ");
  return "";
}

export function contextOf(mail: GmailMessage, owner: string): MailContext {
  const headers = new Map((mail.payload?.headers ?? []).map(({ name, value }) => [name.toLowerCase(), value]));
  return {
    from: headers.get("from") ?? "",
    to: headers.get("to") ?? "",
    subject: headers.get("subject") ?? "",
    date: headers.get("date") ?? "",
    owner,
    body: bodyOf(mail.payload).replace(/\s+/g, " ").trim().slice(0, 20000),
  };
}

export async function applyActions(token: string, id: string, actions: RuleActions) {
  const addLabelIds = [actions.label, actions.star ? "STARRED" : undefined].filter((x): x is string => !!x);
  const removeLabelIds = [actions.read ? "UNREAD" : undefined, actions.archive ? "INBOX" : undefined].filter((x): x is string => !!x);
  await gmail(token, `/messages/${encodeURIComponent(id)}/modify`, {
    method: "POST", body: JSON.stringify({ addLabelIds, removeLabelIds }),
  });
}
