"use client";

import { useEffect, useState } from "react";
import type { RunProgress } from "@/lib/run-progress-types";

export function useRunStream(id: string | null, page: number | null, version: number) {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [connection, setConnection] = useState<"connecting" | "live" | "reconnecting" | "disconnected" | "unavailable" | "finished">("connecting");
  useEffect(() => {
    if (!id) return;
    const stream = new EventSource(`/api/mable/runs/${id}/events${page === null ? "" : `?page=${page}`}`);
    stream.addEventListener("progress", (event) => {
      const next: RunProgress = JSON.parse(event.data);
      setProgress(next);
      if (["queued", "running"].includes(next.status)) setConnection("live");
      else { setConnection("finished"); stream.close(); }
    });
    stream.addEventListener("unavailable", () => { setConnection("unavailable"); stream.close(); });
    stream.addEventListener("interrupted", () => setConnection("reconnecting"));
    stream.onerror = () => setConnection(stream.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting");
    return () => stream.close();
  }, [id, page, version]);
  return { progress, connection };
}
