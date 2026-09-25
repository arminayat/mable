"use client";

import { useEffect, useRef, useState } from "react";
import { Archive, Check, LoaderCircle, MailOpen, Star, Tag } from "lucide-react";
import type { EmailPreview, RunItem, RunProgress } from "@/lib/run-progress-types";
import type { Label } from "./types";

const phaseNames: Record<string, string> = {
  waiting: "Waiting", loading: "Loading email", evaluating: "Jev is evaluating", applying: "Applying actions",
  done: "Applied", no_match: "No match", not_in_inbox: "No longer in Inbox", unavailable: "Email unavailable",
  retrying: "Waiting to retry", failed: "Failed", blocked: "Needs attention", skipped: "Skipped",
};

function EmailContent({ runId, item, visible }: { runId: string; item: RunItem; visible: boolean }) {
  const [preview, setPreview] = useState<EmailPreview | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!visible) return;
    const abort = new AbortController();
    fetch(`/api/mable/runs/${runId}/messages/${encodeURIComponent(item.messageId)}`, { cache: "no-store", signal: abort.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load email");
        setPreview(result); setError("");
      }).catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load email"); });
    return () => abort.abort();
  }, [runId, item.messageId, attempt, visible]);
  if (error) return <div className="run-preview-error"><p>{error}</p><button className="text-button" onClick={() => { setError(""); setAttempt(attempt + 1); }}>Try again</button></div>;
  if (!preview) return <div className="run-preview-placeholder" aria-label="Loading email preview"><span/><span/><span/></div>;
  return <><h3>{preview.subject}</h3>{preview.from && <p className="run-email-from">{preview.from}</p>}<p className="run-email-excerpt">{preview.excerpt || "No preview available."}</p></>;
}

function Evaluation({ item, progress, labels }: { item: RunItem; progress: RunProgress; labels: Label[] }) {
  const selected = item.probabilities?.findIndex((value) => value >= progress.threshold / 100) ?? -1;
  const actions = item.actions;
  const active = ["queued", "running"].includes(progress.status);
  return <>
    {item.probabilities ? <ol className="run-scores">{progress.rules.map((rule, index) => {
      const probability = item.probabilities?.[index];
      return <li key={rule.id} data-selected={selected === index || undefined}>
        <span>{rule.question}{selected === index && <small>First match</small>}</span>
        <strong>{probability === undefined ? "—" : `${Number((probability * 100).toFixed(1))}%`}</strong>
      </li>;
    })}</ol> : <p className="run-result-placeholder">{
      item.phase === "evaluating" && active ? "Evaluating your questions…" : item.phase === "loading" && active ? "Preparing email for Jev…" :
      ["done", "skipped"].includes(item.phase) ? "Scores weren’t recorded for this run." :
      item.phase === "not_in_inbox" ? "Skipped because this email left your inbox." : item.phase === "unavailable" ? "This email is no longer available." :
      ["failed", "blocked"].includes(item.phase) ? "Evaluation unavailable. Retry after resolving the run error." : "No evaluation yet."
    }</p>}
    {actions && <><p className="run-actions-caption">{item.state === "done" ? "Applied actions" : "Selected actions"}</p><div className="run-applied-actions">
      {actions.label && <span data-action="label"><Tag size={14}/>{labels.find((label) => label.id === actions.label)?.name ?? actions.label}</span>}
      {actions.star && <span data-action="star"><Star size={14}/>Star</span>}
      {actions.read && <span data-action="read"><MailOpen size={14}/>Mark read</span>}
      {actions.archive && <span data-action="archive"><Archive size={14}/>Archive</span>}
    </div></>}
    {item.probabilities && selected < 0 && <p className="run-result-placeholder">Below {progress.threshold}%. No actions applied.</p>}
  </>;
}

export function RunProgressView({ progress, labels, following, pauseFollowing }: { progress: RunProgress; labels: Label[]; following: boolean; pauseFollowing: () => void }) {
  const list = useRef<HTMLDivElement>(null);
  const requestedPreviews = useRef(new Set<string>());
  const [visiblePreviews, setVisiblePreviews] = useState<Set<string>>(() => new Set());
  const active = ["running", "queued"].includes(progress.status);
  const current = progress.items.find((item) => ["loading", "evaluating", "applying"].includes(item.phase));
  const latest = current ?? progress.items.findLast((item) => item.state !== "pending");
  useEffect(() => {
    const container = list.current;
    if (!container) return;
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const id = entry.target.getAttribute("data-preview-id");
        if (id && !requestedPreviews.current.has(id)) { requestedPreviews.current.add(id); changed = true; }
        observer.unobserve(entry.target);
      }
      if (changed) setVisiblePreviews(new Set(requestedPreviews.current));
    }, { root: container, rootMargin: "300px 0px" });
    container.querySelectorAll<HTMLElement>("[data-preview-id]").forEach((element) => {
      if (!requestedPreviews.current.has(element.dataset.previewId!)) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [progress.id, progress.items.length]);
  useEffect(() => {
    const container = list.current;
    const row = container?.querySelector<HTMLElement>(`[data-message-position="${latest?.position}"]`);
    if (!following || !active || !container || !row) return;
    const follow = () => container.scrollTo({ top: Math.max(0, row.offsetTop - 70), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    follow();
    // Keep the active row in view when asynchronous previews change earlier row heights.
    const observer = new ResizeObserver(follow);
    observer.observe(container.querySelector(".run-review-list")!);
    return () => observer.disconnect();
  }, [following, active, latest?.position]);
  return <div className="run-review-body" ref={list} role="region" tabIndex={0} aria-label="Run results" onWheel={following ? pauseFollowing : undefined} onTouchStart={following ? pauseFollowing : undefined}
    onKeyDown={(event) => { if (following && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) pauseFollowing(); }}>
    <div className="run-column-headings" aria-hidden="true"><span>Email</span><span>Jev evaluation <small>Match at {progress.threshold}% · first match wins</small></span></div>
    <div className="run-review-list">
      {!progress.items.length && <div className="run-empty">{!progress.discovered && active ? <><LoaderCircle className="run-spinner" size={24}/><p>{progress.status === "queued" ? "Waiting for the worker…" : "Finding emails in Gmail…"}</p></> : <p>{progress.status === "complete" ? "No emails to process in this scope." : "No emails discovered yet."}</p>}</div>}
      {progress.items.map((item) => {
        const processing = active && ["loading", "evaluating", "applying"].includes(item.phase);
        const pending = ["pending", "decided"].includes(item.state);
        const phase = !active && pending ? (progress.status === "cancelled" ? "Stopped" : "Needs attention") : phaseNames[item.phase] ?? "Waiting";
        return <article key={item.id} className="run-review-item" data-message-position={item.position} data-processing={processing || undefined}>
          <div className="run-email-preview" data-preview-id={item.id}><div className="run-item-number">Email {item.position + 1}</div><EmailContent runId={progress.id} item={item} visible={typeof IntersectionObserver === "undefined" || visiblePreviews.has(item.id)}/></div>
          <div className="run-evaluation"><div className="run-item-phase" data-state={item.state}>
            {processing ? <LoaderCircle size={14} className="run-spinner"/> : item.state === "done" ? <Check size={14}/> : null}{phase}
          </div><Evaluation item={item} progress={progress} labels={labels}/></div>
        </article>;
      })}
    </div>
  </div>;
}
