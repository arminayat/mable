"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Play, X } from "lucide-react";
import type { Command, Label, Run } from "./types";
import { SelectField } from "./select-field";
import { RunProgressView } from "./run-progress-view";
import { useRunStream } from "./use-run-stream";
import "./run-dialog.css";

const statusNames = { queued: "Waiting for worker", running: "Cleaning your inbox", complete: "Cleanup complete", cancelled: "Cleanup stopped", failed: "Cleanup needs attention", paused: "Cleanup paused" };

export function RunDialog({ initialRunId, labels, command, changed, close }: {
  initialRunId: string | null; labels: Label[]; command: Command; changed: () => void; close: () => void;
}) {
  const [runId, setRunId] = useState(initialRunId);
  const [scope, setScope] = useState("new");
  const [following, setFollowing] = useState(true);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLElement>(null);
  const { progress, connection } = useRunStream(runId, version);
  const active = progress && ["running", "queued"].includes(progress.status);
  const resumable = progress && ["failed", "paused"].includes(progress.status);
  const lastStatus = useRef(progress?.status);
  useEffect(() => {
    if (lastStatus.current !== progress?.status) { lastStatus.current = progress?.status; changed(); }
  }, [progress?.status, changed]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);

  async function start() {
    setBusy(true); setError("");
    try {
      const run = await command({ type: "run.create", scope }) as Run;
      setRunId(run.id); changed();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start cleanup"); }
    finally { setBusy(false); }
  }
  async function update(type: "run.cancel" | "run.retry") {
    setBusy(true); setError("");
    try { await command({ type, id: runId }); setVersion((current) => current + 1); changed(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update cleanup"); }
    finally { setBusy(false); }
  }

  return <div className="overlay run-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={panel} tabIndex={-1} className={`panel run-dialog ${runId ? "run-dialog-expanded" : ""}`} role="dialog" aria-modal="true" aria-labelledby="run-dialog-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
        if (event.key !== "Tab") return;
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), [tabindex="0"]')].filter((element) => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
      }}>
      <header className="run-dialog-header"><div><h2 id="run-dialog-title">{progress ? statusNames[progress.status] : "Run cleanup"}</h2>
        {runId && <p className="run-progress-summary" role="status">{progress ? <><strong>{progress.processed} / {progress.total}</strong> processed{!progress.discovered && active ? " · finding emails…" : ""}</> : "Connecting to your run…"}</p>}
      </div><Button variant="ghost" isIconOnly aria-label="Close cleanup" onPress={close}><X size={18}/></Button></header>
      {!runId ? <div className="run-setup"><p className="muted">Actions will be applied directly to matching emails.</p>
        <div className="field-title" id="run-scope-label">Process</div><SelectField labelledBy="run-scope-label" value={scope} onChange={setScope} disabled={busy} options={[
          { id: "new", label: "New mail since connecting" }, { id: "latest", label: "Last 50 emails" },
          { id: "recent", label: "Inbox mail from the last 30 days" }, { id: "all", label: "Entire inbox" },
        ]}/>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions"><Button variant="secondary" onPress={close}>Cancel</Button><Button variant="primary" isDisabled={busy} onPress={() => void start()}><Play size={16}/>{busy ? "Starting…" : "Start run"}</Button></div>
      </div> : <>
        <div className="run-progress-track" role="progressbar" aria-label="Emails processed" aria-valuemin={0} aria-valuemax={progress?.total || 1} aria-valuenow={progress?.discovered ? progress.processed : undefined} aria-valuetext={progress ? `${progress.processed} of ${progress.total} processed` : "Finding emails"}>
          <span style={{ width: `${progress?.total ? progress.processed / progress.total * 100 : progress?.status === "complete" ? 100 : 0}%` }}/>
        </div>
        <div className="run-review-toolbar"><span>{progress ? `${progress.changed} changed · ${progress.skipped} skipped · ${progress.failed} failed` : "Loading progress…"}</span>
          {active && <Button size="sm" variant="ghost" onPress={() => setFollowing((value) => !value)}>{following ? "Pause following" : "Follow live"}</Button>}
        </div>
        {["reconnecting", "disconnected", "unavailable"].includes(connection) && <p className="run-connection-note" role="status">{connection === "unavailable" ? "This run is no longer available." : connection === "disconnected" ? "Could not connect to this run. Try reconnecting." : "Connection interrupted. Reconnecting…"}<button className="text-button" onClick={() => setVersion((current) => current + 1)}>Reconnect</button></p>}
        {(error || progress?.error) && <p className="error run-dialog-error" role="alert">{error || progress?.error}</p>}
        {progress ? <RunProgressView progress={progress} labels={labels} following={following} pauseFollowing={() => setFollowing(false)}/> : <div className="run-empty">Loading your run…</div>}
        <div className="run-dialog-footer"><div className="run-dialog-buttons">
          {active && <Button variant="ghost" isDisabled={busy} onPress={() => void update("run.cancel")}>Stop run</Button>}
          {resumable && <><Button variant="ghost" isDisabled={busy} onPress={() => void update("run.cancel")}>Discard</Button><Button isDisabled={busy} onPress={() => void update("run.retry")}>Retry run</Button></>}
          <Button variant="secondary" onPress={close}>{active ? "Close" : "Done"}</Button>
        </div></div>
      </>}
    </section>
  </div>;
}
