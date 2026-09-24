"use client";
import { useState } from "react";
import { Button } from "@heroui/react";
import { Archive, Check, MailOpen, Star, Tag, X } from "lucide-react";
import type { RuleActions } from "@/lib/schema";
import type { Command, Label, Rule } from "./types";

const options = [
  { key: "star", label: "Star", icon: Star },
  { key: "read", label: "Mark read", icon: MailOpen },
  { key: "archive", label: "Archive", icon: Archive },
] as const;

export function RuleEditor({ rule, labels, command, close, saved }: {
  rule?: Rule; labels: Label[]; command: Command; close: () => void; saved: () => void;
}) {
  const [question, setQuestion] = useState(rule?.question ?? "");
  const [actions, setActions] = useState<RuleActions>(rule?.actions ?? {});
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createLabel() {
    if (!newLabel.trim()) return;
    setBusy(true); setError("");
    try {
      const label = await command({ type: "label.create", name: newLabel.trim() }) as Label;
      setActions((current) => ({ ...current, label: label.id }));
      setNewLabel(""); saved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create label"); }
    finally { setBusy(false); }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await command({ type: rule ? "rule.update" : "rule.create", id: rule?.id, question: question.trim(), actions, enabled });
      saved(); close();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save rule"); }
    finally { setBusy(false); }
  }

  return <form className="editor" onSubmit={submit}>
    <div className="editor-top"><label htmlFor="question">Question</label><Button type="button" isIconOnly variant="ghost" aria-label="Close editor" onPress={close}><X size={17}/></Button></div>
    <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={2} placeholder="Is this about my GitHub project’s pipeline?" required />
    <div className="field-title">When the answer is yes</div>
    <div className="action-choices">
      <button type="button" aria-pressed={!!actions.label} className={`action-choice ${actions.label ? "selected" : ""}`} onClick={() => setActions((value) => ({ ...value, label: value.label ? undefined : labels[0]?.id }))} disabled={!labels.length}>
        <Tag size={17}/> Label
      </button>
      {options.map(({ key, label, icon: Icon }) => <button key={key} type="button" aria-pressed={!!actions[key]} className={`action-choice ${actions[key] ? "selected" : ""}`} onClick={() => setActions((value) => ({ ...value, [key]: value[key] ? undefined : true }))}>
        <Icon size={17}/> {label}
      </button>)}
    </div>
    <div className="label-line">
      <select aria-label="Gmail label" value={actions.label ?? ""} onChange={(event) => setActions((value) => ({ ...value, label: event.target.value || undefined }))}>
        <option value="">No label</option>
        {labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}
      </select>
      <input aria-label="New label name" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="New label name" />
      <Button type="button" variant="secondary" isDisabled={busy || !newLabel.trim()} onPress={createLabel}>Create</Button>
    </div>
    <label className="check-line"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enabled</label>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="editor-footer"><Button type="submit" isDisabled={busy || !question.trim() || !Object.values(actions).some(Boolean)}><Check size={16}/> Save question</Button></div>
  </form>;
}
