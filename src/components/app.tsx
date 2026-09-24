"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Tooltip } from "@heroui/react";
import { Archive, ArrowDown, ArrowUp, Check, MailOpen, Plus, Play, Settings2, Star, Tag, Trash2 } from "lucide-react";
import { RuleEditor } from "./rule-editor";
import { SettingsPanel } from "./settings-panel";
import type { Command, Rule, View } from "./types";

function ActionIcon({ label, children }: { label: string; children: React.ReactNode }) {
  return <Tooltip><Tooltip.Trigger><span className="row-icon" role="img" aria-label={label} tabIndex={0}>{children}</span></Tooltip.Trigger><Tooltip.Content>{label}</Tooltip.Content></Tooltip>;
}

function RuleRow({ rule, view, index, edit, move, remove, toggle }: {
  rule: Rule; view: View; index: number; edit: () => void; move: (offset: number) => void; remove: () => void; toggle: () => void;
}) {
  const labelName = view.labels.find((label) => label.id === rule.actions.label)?.name ?? "Label";
  return <article className={`rule-row ${rule.enabled ? "" : "disabled"}`}>
    <div className="order-controls">
      <button aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => move(-1)}><ArrowUp size={15}/></button>
      <button aria-label={`Move question ${index + 1} down`} disabled={index === view.rules.length - 1} onClick={() => move(1)}><ArrowDown size={15}/></button>
    </div>
    <button className="question-text" onClick={edit}>{rule.question}</button>
    <div className="row-actions">
      {rule.actions.label && <ActionIcon label={`Apply ${labelName} label`}><Tag size={17}/></ActionIcon>}
      {rule.actions.star && <ActionIcon label="Star"><Star size={17}/></ActionIcon>}
      {rule.actions.read && <ActionIcon label="Mark read"><MailOpen size={17}/></ActionIcon>}
      {rule.actions.archive && <ActionIcon label="Archive"><Archive size={17}/></ActionIcon>}
    </div>
    <div className="row-menu"><button className="toggle" aria-label={`${rule.enabled ? "Disable" : "Enable"} question ${index + 1}`} aria-pressed={rule.enabled} onClick={toggle}><span/></button><button className="delete-rule" aria-label={`Delete question ${index + 1}`} onClick={remove}><Trash2 size={16}/></button></div>
  </article>;
}

export function MableApp({ email }: { email: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [scope, setScope] = useState("new");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/mable", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load your account");
    setView(await response.json());
  }, []);
  useEffect(() => {
    void fetch("/api/mable", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your account");
        setView(await response.json());
      })
      .catch((cause) => setError(cause.message));
  }, []);
  useEffect(() => {
    const interval = setInterval(() => { void refresh().catch(() => {}); }, view?.run?.status === "running" || view?.run?.status === "queued" ? 3000 : 30000);
    return () => clearInterval(interval);
  }, [refresh, view?.run?.status]);

  const command: Command = async (payload) => {
    setError("");
    const response = await fetch("/api/mable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Request failed");
    return data;
  };
  const act = async (payload: Record<string, unknown>) => {
    try { await command(payload); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed"); }
  };
  async function move(index: number, offset: number) {
    if (!view) return;
    const ids = view.rules.map((rule) => rule.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    await act({ type: "rule.reorder", ids });
  }

  if (!view) return <main className="shell"><div className="brand">mable<span>.</span></div><p className="muted">Loading your questions…</p>{error && <p className="error">{error}</p>}</main>;
  return <main className="shell">
    <header className="topbar"><div className="brand">mable<span>.</span></div><div className="top-actions"><span className="account-email">{email}</span><Button variant="ghost" isIconOnly aria-label="Settings" onPress={() => setSettingsOpen(true)}><Settings2 size={19}/></Button></div></header>
    <section className="intro"><div className="eyebrow">YOUR INBOX, SIMPLIFIED</div><h1>Questions that clear the clutter.</h1><p>Ask a simple question about each email. Mable takes the first matching action.</p></section>
    <div className="list-heading"><div><h2>Your questions</h2><p>Order matters. The first confident match wins.</p></div><Button onPress={() => setEditing("new")}><Plus size={17}/> Add question</Button></div>
    {!view.rules.length ? <div className="empty"><div className="empty-icon">?</div><h3>Start with one question.</h3><p>Try “Is this about GitHub?” and give it a label. For your own project, include your GitHub username or repository in the question.</p></div> : <div className="rules">{view.rules.map((rule, index) => <RuleRow key={rule.id} rule={rule} view={view} index={index} edit={() => setEditing(rule)} move={(offset) => void move(index, offset)} remove={() => void act({ type: "rule.delete", id: rule.id })} toggle={() => void act({ type: "rule.update", id: rule.id, question: rule.question, actions: rule.actions, enabled: !rule.enabled })}/>)}</div>}
    {editing && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="panel" role="dialog" aria-modal="true" aria-label={editing === "new" ? "Add question" : "Edit question"}><RuleEditor rule={editing === "new" ? undefined : editing} labels={view.labels} command={command} close={() => setEditing(null)} saved={() => void refresh()} /></section></div>}
    <div className="bottom-bar"><div className="connection"><span className={`dot ${view.gmailConnected ? "on" : ""}`}/>{view.gmailConnected ? "Gmail connected" : "Reconnect Gmail in settings"}</div><Button isDisabled={!view.settings.hasKey || !view.gmailConnected || !view.rules.some((rule) => rule.enabled)} onPress={() => setRunOpen(true)}><Play size={16}/> Run now</Button></div>
    {view.run && <div className="run-status"><div><span className="status-title">{view.run.status === "complete" ? <Check size={16}/> : null}{view.run.status === "running" ? "Cleaning your inbox" : `Last run · ${view.run.status}`}</span><span className="muted">{view.run.processed} processed · {view.run.changed} changed · {view.run.skipped} skipped · {view.run.failed} failed</span>{view.run.error && <span className="error">{view.run.error}</span>}</div><div>{["queued", "running"].includes(view.run.status) && <Button variant="ghost" onPress={() => void act({ type: "run.cancel", id: view.run?.id })}>Cancel</Button>}{["failed", "paused"].includes(view.run.status) && <><Button variant="ghost" onPress={() => void act({ type: "run.cancel", id: view.run?.id })}>Discard</Button><Button variant="secondary" onPress={() => void act({ type: "run.retry", id: view.run?.id })}>Retry</Button></>}</div></div>}
    {error && <p className="error" role="alert">{error}</p>}
    <footer>Questions stay yours. Email content is not saved by Mable. · <Link href="/privacy">Privacy</Link></footer>
    {settingsOpen && <SettingsPanel view={view} command={command} close={() => setSettingsOpen(false)} changed={() => void refresh()}/>}
    {runOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRunOpen(false); }}><section className="panel small-panel" role="dialog" aria-modal="true" aria-label="Run cleanup"><h2>Run cleanup</h2><p className="muted">Actions will be applied directly to matching emails.</p><label className="field-title" htmlFor="run-scope">Process</label><select id="run-scope" value={scope} onChange={(event) => setScope(event.target.value)}><option value="new">New mail since connecting</option><option value="recent">Inbox mail from the last 30 days</option><option value="all">Entire inbox</option></select><div className="modal-actions"><Button variant="ghost" onPress={() => setRunOpen(false)}>Cancel</Button><Button onPress={() => { setRunOpen(false); void act({ type: "run.create", scope }); }}><Play size={16}/> Start run</Button></div></section></div>}
  </main>;
}
