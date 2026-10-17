"use client";

import { useState } from "react";
import { Button, Modal } from "@heroui/react";
import { Clock } from "lucide-react";
import { scheduleOptions, type Schedule } from "@/lib/schedule";
import { SelectField } from "./select-field";
import type { Command, View } from "./types";
import "./schedule-control.css";

function waitingReason(view: View) {
  if (view.settings.pauseReason) return view.settings.pauseReason;
  if (!view.settings.hasKey) return "Add your AI API key in Settings.";
  if (!view.gmailConnected) return "Reconnect Google in Settings.";
  if (!view.rules.some((rule) => rule.enabled)) return "Add or enable a question.";
  if (view.run && ["paused", "failed"].includes(view.run.status)) return "Retry or discard your unfinished run.";
  return null;
}

export function ScheduleStatus({ view }: { view: View }) {
  if (view.settings.schedule === "off") return <p>Automatic runs are off.</p>;
  const reason = waitingReason(view);
  if (reason) return <p>Schedule is waiting. {reason}</p>;
  if (!view.settings.nextRunAt) return <p>Waiting for the next scheduled check.</p>;
  const next = new Date(view.settings.nextRunAt);
  return <p>Next check: <time dateTime={view.settings.nextRunAt}>{next.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</time>.</p>;
}

function ScheduleForm({ view, command, changed, close }: { view: View; command: Command; changed: () => Promise<void>; close: () => void }) {
  const [schedule, setSchedule] = useState<Schedule>(view.settings.schedule);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setBusy(true); setError("");
    try {
      await command({ type: "schedule.update", schedule });
      await changed();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save schedule");
    } finally { setBusy(false); }
  }

  return <>
    <Modal.Header><Modal.Heading>Schedule actions</Modal.Heading></Modal.Header>
    <Modal.Body>
      <p>Automatically apply your enabled questions and actions to new inbox mail, even when Mable is closed.</p>
      <SelectField label="Run frequency" value={schedule} onChange={(value) => setSchedule(value as Schedule)} options={scheduleOptions} disabled={busy}/>
      <div className="schedule-status" role="status"><ScheduleStatus view={view}/></div>
      <p className="muted">The first check is one interval after you enable or change the schedule. Busy runs may delay a check. Turning it off leaves any current run running.</p>
      {schedule !== "off" && view.settings.schedule === "off" && waitingReason(view) && <p className="muted">Before automatic runs can start: {waitingReason(view)}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </Modal.Body>
    <Modal.Footer>
      <Button variant="secondary" isDisabled={busy} onPress={close}>Cancel</Button>
      <Button isDisabled={busy} onPress={() => void save()}>{busy ? "Saving…" : "Save schedule"}</Button>
    </Modal.Footer>
  </>;
}

export function ScheduleControl({ view, command, changed }: { view: View; command: Command; changed: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const enabled = view.settings.schedule !== "off";
  const label = enabled ? waitingReason(view) ? "Schedule waiting" : `Every ${view.settings.schedule}` : "Schedule";
  return <Modal isOpen={open} onOpenChange={setOpen}>
    <Button variant="ghost" className="schedule-trigger" data-enabled={enabled || undefined} aria-label={`Schedule actions: ${enabled ? label : "off"}`}><Clock size={18} aria-hidden="true"/>{label}</Button>
    <Modal.Backdrop>
      <Modal.Container size="sm" placement="center">
        <Modal.Dialog className="schedule-dialog">
          <Modal.CloseTrigger aria-label="Close schedule"/>
          {open && <ScheduleForm view={view} command={command} changed={changed} close={() => setOpen(false)}/>}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  </Modal>;
}
