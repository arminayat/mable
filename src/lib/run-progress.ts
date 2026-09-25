import { and, asc, eq } from "drizzle-orm";
import { db } from "./db";
import { runMessages, runs } from "./schema";
import type { RunProgress } from "./run-progress-types";

export async function getRunProgress(userId: string, id: string): Promise<RunProgress | null> {
  const [run] = await db.select().from(runs).where(and(eq(runs.id, id), eq(runs.userId, userId))).limit(1);
  if (!run) return null;
  const items = await db.select({
    id: runMessages.id, messageId: runMessages.messageId, position: runMessages.position,
    state: runMessages.state, phase: runMessages.phase, probabilities: runMessages.probabilities, actions: runMessages.actions,
  }).from(runMessages).where(eq(runMessages.runId, id))
    .orderBy(asc(runMessages.position), asc(runMessages.id));
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.state] = (counts[item.state] ?? 0) + 1;
  return {
    id, status: run.status, discovered: run.discovered, error: run.error,
    total: items.length, processed: (counts.done ?? 0) + (counts.skipped ?? 0) + (counts.failed ?? 0),
    changed: counts.done ?? 0, skipped: counts.skipped ?? 0, failed: counts.failed ?? 0,
    threshold: run.threshold, rules: run.rulesSnapshot, items,
  };
}
