import { setTimeout as delay } from "node:timers/promises";
import { auth } from "@/lib/auth";
import { getRunProgress } from "@/lib/run-progress";
import type { RunProgress } from "@/lib/run-progress-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await context.params;
  const pageValue = new URL(request.url).searchParams.get("page");
  const page = pageValue === null ? undefined : Number(pageValue);
  if (page !== undefined && (!Number.isSafeInteger(page) || page < 0)) return new Response("Invalid page", { status: 400 });
  const initial = await getRunProgress(session.user.id, id, page);
  if (!initial) return new Response("Run not found", { status: 404 });
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  request.signal.addEventListener("abort", onAbort, { once: true });
  if (request.signal.aborted) abort.abort();
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();
      let previous = "";
      let snapshot: RunProgress | null = initial;
      try {
        // Reconnect periodically to recheck the session; snapshots make reconnects lossless.
        while (!abort.signal.aborted && Date.now() - started < 50_000) {
          if (!snapshot) {
            controller.enqueue(encoder.encode('event: unavailable\ndata: {}\n\n'));
            break;
          }
          const serialized = JSON.stringify(snapshot);
          if (serialized !== previous) {
            controller.enqueue(encoder.encode(`event: progress\ndata: ${serialized}\n\n`));
            previous = serialized;
          } else controller.enqueue(encoder.encode(': heartbeat\n\n'));
          if (!["running", "queued"].includes(snapshot.status)) break;
          await delay(1000, undefined, { signal: abort.signal });
          snapshot = await getRunProgress(session.user.id, id, page);
        }
      } catch {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode('event: interrupted\ndata: {}\n\n'));
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        if (!cancelled) controller.close();
      }
    },
    cancel() { cancelled = true; abort.abort(); request.signal.removeEventListener("abort", onAbort); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream", "Cache-Control": "private, no-store, no-transform", "X-Accel-Buffering": "no",
  } });
}
