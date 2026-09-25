"use client";
import { LabelPicker } from "./label-picker";
import { useState } from "react";
import { Button, Tooltip } from "@heroui/react";
import { Archive, Check, ToggleLeft, ToggleRight, MailOpen, Star, Tag, Trash2 } from "lucide-react";
import type { RuleActions } from "@/lib/schema";
import type { Command, Label, Rule } from "./types";

const options = [
  { key: "read", label: "Mark as read", icon: MailOpen },
  { key: "star", label: "Star", icon: Star },
  { key: "archive", label: "Archive", icon: Archive },
] as const;

export function RuleEditor({ rule, initialQuestion = "", inlineQuestion, exiting = false, onExited, onCreated, onUpdated, labels, command, close, saved }: {
  onCreated?: (rule: Rule) => Promise<void>;
  onUpdated?: (rule: Rule) => Promise<void>;
  rule?: Rule; initialQuestion?: string; inlineQuestion?: string; exiting?: boolean; onExited?: () => void; labels: Label[]; command: Command; close: () => void; saved: (questionSaved?: boolean) => void;
}) {
  const [question, setQuestion] = useState(rule?.question ?? initialQuestion);
  const inline = inlineQuestion !== undefined;
  const currentQuestion = inlineQuestion ?? question;
  const [labelOpen, setLabelOpen] = useState(!!rule?.actions.label);
  const [actions, setActions] = useState<RuleActions>(rule?.actions ?? {});
  const hasActions = Object.values(actions).some(Boolean);
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [complete, setComplete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createLabel(name: string) {
    if (!name.trim()) return;
    setBusy(true); setError("");
    try {
      const label = await command({ type: "label.create", name: name.trim() }) as Label;
      setActions((current) => ({ ...current, label: label.id }));
      saved();
      return label;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create label"); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !currentQuestion.trim() || !hasActions) return;
    setBusy(true); setError("");
    try {
      const result = await command({ type: rule ? "rule.update" : "rule.create", id: rule?.id, question: currentQuestion.trim(), actions, enabled });
      if (inline && onCreated) {
        setComplete(true);
        await onCreated((result as Rule[])[0]);
      } else if (rule && onUpdated) {
        await onUpdated(result as Rule);
      } else { saved(true); close(); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save rule"); }
    finally { setBusy(false); }
  }

  return <form className={`editor ${inline ? "inline-editor" : ""} ${exiting ? "is-exiting" : ""} ${complete ? "is-saved" : ""}`} inert={exiting} onKeyDown={(event) => { if (rule && !busy && event.key === "Escape") { event.stopPropagation(); close(); } }} onAnimationEnd={(event) => { if (exiting && event.animationName === "hide-action" && (event.target as HTMLElement).classList.contains("action-selection-hint")) onExited?.(); }} onSubmit={submit}>
    {!inline && <textarea id="question" aria-label="Question" disabled={busy} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={2} placeholder="Is this about my GitHub project’s pipeline?" required />}
    <div className={inline ? "action-selection-row" : "rule-edit-action-row"}>
    <div className="action-choices">
      {options.map(({ key, label, icon: Icon }) => <Tooltip key={key} delay={200}><Button type="button" aria-label={label} data-action={key} isDisabled={busy} aria-pressed={!!actions[key]} className={`action-choice ${actions[key] ? "selected" : ""}`} onPress={() => setActions((value) => ({ ...value, [key]: value[key] ? undefined : true }))}>
        <Icon size={17} aria-hidden="true"/>
      </Button><Tooltip.Content>{label}</Tooltip.Content></Tooltip>)}
      <div className={inline ? `label-action ${labelOpen ? "is-open" : ""}` : undefined}>
      <Tooltip delay={200}><Button type="button" aria-label="Label" data-action="label" aria-pressed={labelOpen} className={`action-choice ${labelOpen ? "selected" : ""}`} onPress={() => { setLabelOpen(!labelOpen); setActions((value) => ({ ...value, label: undefined })); }} isDisabled={busy}>
        <Tag size={17} aria-hidden="true"/>
      </Button><Tooltip.Content>Label</Tooltip.Content></Tooltip>
      {inline && <div className="label-action-picker" inert={!labelOpen} aria-hidden={!labelOpen}>
        <LabelPicker key={String(labelOpen)} labels={labels} value={actions.label} disabled={busy || !labelOpen}
          onChange={(label) => setActions((current) => ({ ...current, label }))} onCreate={createLabel}/>
      </div>}
      </div>
    </div>
    {!inline && <div className="rule-edit-controls">
      <Tooltip delay={200}><Button type="button" isIconOnly className="toggle" aria-label="Enabled" aria-pressed={enabled} isDisabled={busy} onPress={() => setEnabled(!enabled)}>{enabled ? <ToggleRight size={26} aria-hidden="true"/> : <ToggleLeft size={26} aria-hidden="true"/>}</Button><Tooltip.Content>Active</Tooltip.Content></Tooltip>
      {rule && <Tooltip delay={200}><Button type="button" isIconOnly className="delete-rule" aria-label="Delete question" isDisabled={busy} onPress={async () => {
        setBusy(true); setError("");
        try { await command({ type: "rule.delete", id: rule.id }); saved(); close(); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete question"); }
        finally { setBusy(false); }
      }}><Trash2 size={16}/></Button><Tooltip.Content>Delete</Tooltip.Content></Tooltip>}
    </div>}
    {inline && <p className={`action-selection-hint ${hasActions ? "is-ready" : ""} ${labelOpen ? "label-expanded" : ""}`}>
      <span className="action-selection-prompt" aria-hidden={hasActions || labelOpen}>select one or more action</span>
      <button className="action-selection-save" type="submit" aria-hidden={!hasActions} tabIndex={hasActions ? 0 : -1} disabled={!hasActions || busy || !currentQuestion.trim()}>Save</button>
      <span className="action-selection-saved" role="status">{complete ? "Saved!" : ""}</span>
    </p>}
    </div>
    {!inline && labelOpen && <div className="label-line">
      <LabelPicker labels={labels} value={actions.label} disabled={busy}
        onChange={(label) => setActions((current) => ({ ...current, label }))} onCreate={createLabel}/>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    {!inline && hasActions && <div className="editor-footer"><Button type="submit" isDisabled={busy || !currentQuestion.trim()}><Check size={16}/> Save question</Button></div>}
  </form>;
}
