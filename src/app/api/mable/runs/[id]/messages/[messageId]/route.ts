import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { GmailError, googleToken, preview } from "@/lib/gmail";
import { runMessages, runs } from "@/lib/schema";

export async function GET(request: Request, context: { params: Promise<{ id: string; messageId: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id, messageId } = await context.params;
  const [owned] = await db.select({ id: runMessages.id }).from(runMessages)
    .innerJoin(runs, eq(runs.id, runMessages.runId))
    .where(and(eq(runs.userId, session.user.id), eq(runs.id, id), eq(runMessages.messageId, messageId))).limit(1);
  if (!owned) return Response.json({ error: "Email not found in this run" }, { status: 404 });
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return Response.json(await preview(await googleToken(session.user.id), messageId, request.signal), { headers });
  } catch (error) {
    return Response.json({ error: error instanceof GmailError && error.status === 404 ? "Email no longer available in Gmail" : "Could not load this email from Gmail" },
      { status: error instanceof GmailError ? error.status : 502, headers });
  }
}
