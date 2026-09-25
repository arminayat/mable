"use client";
import { SelectField } from "./select-field";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Tooltip } from "@heroui/react";
import { Archive, Check, MailOpen, Play, Star, Tag, Trash2 } from "lucide-react";
import { HowItWorks } from "./how-it-works";
import { moveSavedQuestion } from "./save-question-transition";
import { ReorderHandle } from "./reorder-handle";
import { QuestionComposer } from "./question-composer";
import { UserMenu } from "./user-menu";
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
  return <article data-rule-id={rule.id} className={`rule-row ${rule.enabled ? "" : "disabled"}`}>
    <ReorderHandle index={index} count={view.rules.length} move={move}/>
    <button className="question-text" style={{ paddingRight: `calc(var(--row-control-space) + ${Object.values(rule.actions).filter(Boolean).length} * var(--row-action-space))` }} onClick={edit}>{rule.question}</button>
    <div className="row-menu"><div className="row-actions">
      {rule.actions.label && <ActionIcon label={`Apply ${labelName} label`}><Tag size={17}/></ActionIcon>}
      {rule.actions.star && <ActionIcon label="Star"><Star size={17}/></ActionIcon>}
      {rule.actions.read && <ActionIcon label="Mark read"><MailOpen size={17}/></ActionIcon>}
      {rule.actions.archive && <ActionIcon label="Archive"><Archive size={17}/></ActionIcon>}
    </div>
    <button className="toggle" aria-label={`${rule.enabled ? "Disable" : "Enable"} question ${index + 1}`} aria-pressed={rule.enabled} onClick={toggle}><span/></button><button className="delete-rule" aria-label={`Delete question ${index + 1}`} onClick={remove}><Trash2 size={16}/></button></div>
  </article>;
}

export function MableApp({ email }: { email: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [saveAnimating, setSaveAnimating] = useState(false);
  const [questionDraft, setQuestionDraft] = useState("");
  const [actionsVisible, setActionsVisible] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
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
    const target = index + offset;
    if (target < 0 || target >= ids.length) return;
    const [id] = ids.splice(index, 1);
    ids.splice(target, 0, id);
    const previousRules = view.rules;
    const reordered = ids.map((id, position) => ({ ...view.rules.find((rule) => rule.id === id)!, position }));
    setView((current) => current ? { ...current, rules: reordered } : current);
    try {
      await command({ type: "rule.reorder", ids });
      await refresh();
    } catch (cause) {
      setView((current) => current ? { ...current, rules: previousRules } : current);
      setError(cause instanceof Error ? cause.message : "Could not reorder questions");
    }
  }

  async function finishCreation(rule: Rule) {
    setSaveAnimating(true);
    await new Promise((resolve) => setTimeout(resolve, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650));
    try {
      await moveSavedQuestion(inputRef.current, rule.id, () => {
        setView((current) => current ? { ...current, rules: [...current.rules.filter((item) => item.id !== rule.id), rule].sort((a, b) => a.position - b.position) } : current);
        setQuestionDraft("");
        setActionsVisible(false);
      });
    } finally { setSaveAnimating(false); }
  }

  if (!view) return <main className="shell"><div className="brand">mable<span>.</span></div><p className="muted">Loading your questions…</p>{error && <p className="error">{error}</p>}</main>;
  return <main className="shell app-shell">
    <header className="topbar"><div className="brand">mable<span>.</span></div><div className="header-actions">
      {view.rules.length > 0 && <Button variant="ghost" isIconOnly aria-label="Run now" aria-haspopup="dialog" isDisabled={!view.settings.hasKey || !view.gmailConnected || !view.rules.some((rule) => rule.enabled)} onPress={() => setRunOpen(true)}><Play size={20}/></Button>}
      <UserMenu email={email} openSettings={() => setSettingsOpen(true)} onError={setError}/>
    </div></header>
    <div className={`questions-content ${view.rules.length === 0 ? "questions-content-empty" : ""}`}>
    {view.rules.length > 0 && <div className="rules">{view.rules.map((rule, index) => <RuleRow key={rule.id} rule={rule} view={view} index={index} edit={() => setEditing(rule)} move={(offset) => void move(index, offset)} remove={() => void act({ type: "rule.delete", id: rule.id })} toggle={() => void act({ type: "rule.update", id: rule.id, question: rule.question, actions: rule.actions, enabled: !rule.enabled })}/>)}</div>}
    <QuestionComposer>
      <input ref={inputRef} disabled={saveAnimating} aria-label="New question" placeholder="Ask a question about your emails…" value={questionDraft} onChange={(event) => { setQuestionDraft(event.target.value); if (event.target.value.trim()) setActionsVisible(true); }} maxLength={500} />
      {actionsVisible && <RuleEditor onCreated={finishCreation} exiting={!questionDraft.trim()} onExited={() => { if (!questionDraft.trim()) setActionsVisible(false); }} inlineQuestion={questionDraft} labels={view.labels} command={command} close={() => {}} saved={(questionSaved) => { if (questionSaved) setQuestionDraft(""); void refresh(); }}/>}
    </QuestionComposer>

    {editing && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="panel" role="dialog" aria-modal="true" aria-label="Edit question"><RuleEditor rule={editing} labels={view.labels} command={command} close={() => setEditing(null)} saved={() => void refresh()} /></section></div>}
    {view.run && <div className="run-status"><div><span className="status-title">{view.run.status === "complete" ? <Check size={16}/> : null}{view.run.status === "running" ? "Cleaning your inbox" : `Last run · ${view.run.status}`}</span><span className="muted">{view.run.processed} processed · {view.run.changed} changed · {view.run.skipped} skipped · {view.run.failed} failed</span>{view.run.error && <span className="error">{view.run.error}</span>}</div><div>{["queued", "running"].includes(view.run.status) && <Button variant="ghost" onPress={() => void act({ type: "run.cancel", id: view.run?.id })}>Cancel</Button>}{["failed", "paused"].includes(view.run.status) && <><Button variant="ghost" onPress={() => void act({ type: "run.cancel", id: view.run?.id })}>Discard</Button><Button variant="secondary" onPress={() => void act({ type: "run.retry", id: view.run?.id })}>Retry</Button></>}</div></div>}
    {error && <p className="error" role="alert">{error}</p>}
    </div>
    <footer>Questions stay yours. Email content is not saved by Mable. · <Link href="/privacy">Privacy</Link> · <HowItWorks/></footer>
    {settingsOpen && <SettingsPanel view={view} command={command} close={() => setSettingsOpen(false)} changed={() => void refresh()}/>}
    {runOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRunOpen(false); }}><section className="panel small-panel" role="dialog" aria-modal="true" aria-label="Run cleanup"><h2>Run cleanup</h2><p className="muted">Actions will be applied directly to matching emails.</p><div className="field-title" id="run-scope-label">Process</div><SelectField labelledBy="run-scope-label" value={scope} onChange={setScope} options={[
      { id: "new", label: "New mail since connecting" },
      { id: "recent", label: "Inbox mail from the last 30 days" },
      { id: "all", label: "Entire inbox" },
    ]}/><div className="modal-actions"><Button variant="ghost" onPress={() => setRunOpen(false)}>Cancel</Button><Button onPress={() => { setRunOpen(false); void act({ type: "run.create", scope }); }}><Play size={16}/> Start run</Button></div></section></div>}
  </main>;
}
