"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { ArrowUpRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { Run } from "./types";
import "./run-history-dialog.css";

type HistoryRun = Pick<Run, "id" | "scope" | "status" | "processed" | "changed" | "skipped" | "failed"> & { createdAt: string; updatedAt: string };
type HistoryPage = { runs: HistoryRun[]; page: number; hasMore: boolean };

const scopes: Record<Run["scope"], string> = {
  new: "New mail", latest: "Last 50 emails", recent: "Last 30 days", all: "Entire inbox",
};

export function RunHistoryDialog({ close, review }: { close: () => void; review: (id: string) => void }) {
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<HistoryPage | null>(null);
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const openingReview = useRef(false);

  useEffect(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => { if (!openingReview.current) opener.current?.focus(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/mable/runs?page=${page}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load run history");
        setResult(await response.json() as HistoryPage);
        setError("");
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load run history");
      });
    return () => controller.abort();
  }, [page, reload]);

  const current = result?.page === page && !error ? result : null;
  function openReview(id: string) {
    openingReview.current = true;
    opener.current?.focus();
    review(id);
  }

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} tabIndex={-1} className="panel run-history-dialog" role="dialog" aria-modal="true" aria-labelledby="run-history-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')].filter((element) => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="run-history-header"><div><h2 id="run-history-title">Run history</h2><p>Review previous cleanups and their results.</p></div>
        <Button variant="ghost" isIconOnly aria-label="Close run history" onPress={close}><X size={18}/></Button>
      </header>
      <div className="run-history-list" aria-live="polite">
        {error ? <div className="run-history-message" role="alert">{error}<Button variant="ghost" onPress={() => setReload((value) => value + 1)}>Try again</Button></div>
          : !current ? <div className="run-history-message">Loading runs…</div>
            : current.runs.length === 0 ? <div className="run-history-message">{page === 0 ? "No runs yet. Start a cleanup to see it here." : "No more runs."}</div>
              : current.runs.map((run) => <button key={run.id} className="run-history-item" type="button" onClick={() => openReview(run.id)} aria-label={`Review ${scopes[run.scope]} run from ${new Date(run.createdAt).toLocaleString()}`}>
                <span className="run-history-item-main"><strong>{scopes[run.scope]}</strong><span className="run-history-date">{new Date(run.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span></span>
                <span className="run-history-item-detail"><span className="run-history-status" data-status={run.status}>{run.status}</span><span className="run-history-counts">{run.processed} processed · {run.changed} changed · {run.skipped} skipped · {run.failed} failed</span></span>
                <ArrowUpRight size={18} aria-hidden="true"/>
              </button>)}
      </div>
      {current && (page > 0 || current.hasMore) && <div className="run-history-pagination">
        <Button variant="ghost" isIconOnly aria-label="Newer runs" isDisabled={page === 0} onPress={() => setPage(page - 1)}><ChevronLeft size={18}/></Button>
        <span>Page {page + 1}</span>
        <Button variant="ghost" isIconOnly aria-label="Older runs" isDisabled={!current.hasMore} onPress={() => setPage(page + 1)}><ChevronRight size={18}/></Button>
      </div>}
    </section>
  </div>;
}
