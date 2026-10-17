import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "./db";
import { PublicError } from "./errors";
import { queueRun } from "./runs";
import { nextScheduledRun, schedules, type Schedule } from "./schedule";
import { settings } from "./schema";

export async function scheduleDue() {
  const due = await db.select({ userId: settings.userId }).from(settings).where(and(
    inArray(settings.schedule, schedules.filter((value) => value !== "off")),
    lte(settings.nextRunAt, new Date()), isNull(settings.pauseReason),
  ));
  for (const { userId } of due) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
      const [config] = await tx.select().from(settings).where(eq(settings.userId, userId)).for("update");
      // Recheck after locking: a user may have disabled/changed the schedule,
      // or another tick may have queued its run since the initial due query.
      const now = new Date();
      if (!config || config.schedule === "off" || config.pauseReason || !config.nextRunAt || config.nextRunAt > now) return;
      if (!schedules.includes(config.schedule as Schedule)) return;
      try { await queueRun(tx, userId, "new"); }
      catch (error) {
        // Active/unfinished runs and incomplete setup wait for the next interval.
        // Unexpected errors roll back so the due check can be retried next tick.
        if (!(error instanceof PublicError)) throw error;
      }
      await tx.update(settings).set({ nextRunAt: nextScheduledRun(config.schedule as Schedule, now) }).where(eq(settings.userId, userId));
    });
  }
}
