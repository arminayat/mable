import { desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { runs } from "@/lib/schema";

const pageSize = 20;
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401, headers });

  const rawPage = new URL(request.url).searchParams.get("page") ?? "0";
  const page = Number(rawPage);
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page > Math.floor(Number.MAX_SAFE_INTEGER / pageSize)) {
    return Response.json({ error: "Invalid page" }, { status: 400, headers });
  }

  const rows = await db.select({
    id: runs.id, scope: runs.scope, status: runs.status, processed: runs.processed,
    changed: runs.changed, skipped: runs.skipped, failed: runs.failed,
    createdAt: runs.createdAt, updatedAt: runs.updatedAt,
  }).from(runs).where(eq(runs.userId, session.user.id))
    .orderBy(desc(runs.createdAt), desc(runs.id)).limit(pageSize + 1).offset(page * pageSize);

  return Response.json({ runs: rows.slice(0, pageSize), page, hasMore: rows.length > pageSize }, { headers });
}
