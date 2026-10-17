import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { nextScheduledRun, type Schedule } from "./schedule";
import { settings } from "./schema";

export async function updatePreferences(userId: string, input: { threshold?: number; schedule?: Schedule }) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);
    await tx.insert(settings).values({ userId }).onConflictDoNothing();
    const [current] = await tx.select().from(settings).where(eq(settings.userId, userId)).for("update");
    const value: Partial<typeof settings.$inferInsert> = {};
    if (input.threshold !== undefined) value.threshold = input.threshold;
    if (input.schedule !== undefined) {
      value.schedule = input.schedule;
      // Saving an unchanged interval must not postpone the next scheduled check.
      value.nextRunAt = input.schedule === current.schedule && current.nextRunAt
        ? current.nextRunAt : nextScheduledRun(input.schedule);
      if (input.schedule === "off") value.nextRunAt = null;
    }
    await tx.update(settings).set(value).where(eq(settings.userId, userId));
  });
}
