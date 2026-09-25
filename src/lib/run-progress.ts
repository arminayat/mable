import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { runMessages, runs } from "./schema";
import type { RunProgress } from "./run-progress-types";

const pageSize = 20;

export async function getRunProgress(userId: string, id: string, requestedPage?: number): Promise<RunProgress | null> {
  const [run] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.userId, userId))).limit(1);
  if (!run) return null;
  const grouped = await db.select({ state: runMessages.state, count: sql<number>`count(*)::int` })
    .from(runMessages).where(eq(runMessages.runId, id)).groupBy(runMessages.state);
  const counts = Object.fromEntries(grouped.map(({ state, count }) => [state, count]));
  const total = grouped.reduce((sum, row) => sum + row.count, 0);
  const processed = (counts.done ?? 0) + (counts.skipped ?? 0) + (counts.failed ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  let page = requestedPage;
  if (page === undefined) {
    const [active] = await db.select({ position: runMessages.position }).from(runMessages)
      .where(and(eq(runMessages.runId, id), inArray(runMessages.phase, ["loading", "evaluating", "applying", "blocked"])))
      .orderBy(asc(runMessages.position)).limit(1);
    page = Math.floor((active?.position ?? Math.max(0, processed - 1)) / pageSize);
  }
  page = Math.max(0, Math.min(pageCount - 1, page));
  const items = await db.select({
    id: runMessages.id, messageId: runMessages.messageId, position: runMessages.position,
    state: runMessages.state, phase: runMessages.phase, probabilities: runMessages.probabilities, actions: runMessages.actions,
  }).from(runMessages).where(eq(runMessages.runId, id))
    .orderBy(asc(runMessages.position), asc(runMessages.id)).limit(pageSize).offset(page * pageSize);
  return {
    id, status: run.status, discovered: run.discovered, error: run.error,
    total, processed, changed: counts.done ?? 0, skipped: counts.skipped ?? 0, failed: counts.failed ?? 0,
    threshold: run.threshold, rules: run.rulesSnapshot, page, pageCount, pageSize, items,
  };
}
