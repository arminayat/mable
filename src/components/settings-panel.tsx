"use client";
import { SelectField } from "./select-field";
import { useState } from "react";
import { Button } from "@heroui/react";
import { Trash2, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { Command, View } from "./types";

export function SettingsPanel({ view, command, close, changed }: { view: View; command: Command; close: () => void; changed: () => void }) {
  const [threshold, setThreshold] = useState(view.settings.threshold);
  const [schedule, setSchedule] = useState(view.settings.schedule);
  const [key, setKey] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(payload: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await command(payload); changed(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings"); return false; }
    finally { setBusy(false); }
  }

  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="panel settings-panel" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="panel-head"><h2>Settings</h2><Button isIconOnly variant="ghost" aria-label="Close settings" onPress={close}><X size={18}/></Button></div>
      <div className="setting-block gmail-setting"><div><div className="setting-heading">Gmail</div>
        <p>{view.gmailConnected ? "Connected" : "Reconnect to enable cleanup."}</p></div>
        <Button variant="secondary" onPress={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}>Reconnect Google</Button>
      </div>
      <div className="setting-block"><label className="setting-heading" htmlFor="typesafe-key">TypeSafe API key</label>
        <p>Stored encrypted. Evaluations use your TypeSafe account.</p>
        <div className="setting-row"><input id="typesafe-key" type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder={view.settings.hasKey ? "Key saved · enter a replacement" : "Paste your API key"}/><Button isDisabled={busy || key.length < 10} onPress={async () => { if (await submit({ type: "key.set", key })) setKey(""); }}>Save key</Button></div>
        {view.settings.hasKey && <button className="text-button" onClick={() => void submit({ type: "key.remove" })}>Remove saved key</button>}
      </div>
      <div className="setting-block"><label className="setting-heading" htmlFor="threshold">Match threshold · {threshold}%</label>
        <p>Minimum confidence for a match. Higher means more selective.</p>
        <input id="threshold" type="range" min="50" max="100" step="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
      </div>
      <div className="setting-block"><div className="setting-heading" id="schedule-label">Automatic cleanup</div>
        <p>Choose how often to check new inbox mail.</p>
        <SelectField labelledBy="schedule-label" value={schedule} onChange={setSchedule} options={[
          { id: "off", label: "Off" }, { id: "15m", label: "Every 15 minutes" },
          { id: "1h", label: "Hourly" }, { id: "24h", label: "Every 24 hours" },
        ]}/>
      </div>
      <div className="settings-actions"><Button isDisabled={busy} onPress={() => void submit({ type: "settings.update", threshold, schedule })}>Save preferences</Button></div>
      {view.settings.pauseReason && <p className="error" role="alert">{view.settings.pauseReason}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="setting-block account-block"><h3>Delete account</h3>
        <p>Deleting your account removes your rules, run history, and saved credentials.</p>
        <input aria-label="Type DELETE to confirm account deletion" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type DELETE to confirm" />
        <Button variant="danger" isDisabled={busy || confirm !== "DELETE"} onPress={async () => { if (await submit({ type: "account.delete" })) { await authClient.signOut(); location.reload(); } }}><Trash2 size={16}/> Delete account</Button>
      </div>
    </section>
  </div>;
}
