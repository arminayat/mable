"use client";
import { SelectField } from "./select-field";
import { useRef, useState } from "react";
import { Button } from "@heroui/react";
import { Check, Trash2, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { detectKeyProvider } from "@/lib/key-provider";
import type { Command, View } from "./types";

export function SettingsPanel({ email, view, command, close, changed }: { email: string; view: View; command: Command; close: () => void; changed: () => void }) {
  const [threshold, setThreshold] = useState(String(view.settings.threshold));
  const [schedule, setSchedule] = useState(view.settings.schedule);
  const [key, setKey] = useState("");
  const provider = key.trim() ? detectKeyProvider(key) : view.settings.keyProvider ?? "typesafe";
  const [confirm, setConfirm] = useState(false);
  const confirmStarted = useRef(0);
  const thresholdValue = Number(threshold);
  const validThreshold = Number.isInteger(thresholdValue) && thresholdValue >= 50 && thresholdValue <= 100;
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
        <p>{view.gmailConnected ? email : "Reconnect to enable cleanup."}</p></div>
        <Button variant="ghost" onPress={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}>Reconnect Google</Button>
      </div>
      <div className="setting-block api-key-setting"><label className="setting-heading" htmlFor="ai-key">AI API key</label>
        <p>Stored encrypted. Evaluations use your {provider === "vercel" ? "Vercel AI Gateway" : "TypeSafe"} account.</p>
        {view.settings.hasKey && provider !== view.settings.keyProvider && <p>Saving replaces your current provider and key.</p>}
        <div className="setting-row"><input id="ai-key" aria-label={`${provider === "vercel" ? "Vercel AI Gateway" : "TypeSafe"} API key`} type="password" autoComplete="off" disabled={busy} value={key} onChange={(event) => setKey(event.target.value)} placeholder={view.settings.hasKey && provider === view.settings.keyProvider ? "Key saved · enter a replacement" : "Paste your API key"}/><Button isDisabled={busy || key.trim().length < 10} onPress={async () => { if (await submit({ type: "key.set", key })) setKey(""); }}>Save key</Button></div>
        {view.settings.hasKey && <button className="text-button" disabled={busy} onClick={() => void submit({ type: "key.remove" })}>Remove saved {view.settings.keyProvider === "vercel" ? "Vercel AI Gateway" : "TypeSafe"} key</button>}
      </div>
      <div className="setting-block threshold-setting"><div className="threshold-heading"><label className="setting-heading" htmlFor="threshold">Match threshold (%)</label>
        <p id="threshold-description">Minimum confidence for a match. Higher is more selective.</p></div>
        <input id="threshold" aria-describedby="threshold-description" type="number" min="50" max="100" step="1" required value={threshold} onChange={(event) => setThreshold(event.target.value)} />
      </div>
      <div className="setting-block schedule-setting"><div className="setting-heading" id="schedule-label">Automatic cleanup</div>
        <p>Choose how often to check new inbox mail.</p>
        <SelectField labelledBy="schedule-label" value={schedule} onChange={setSchedule} options={[
          { id: "off", label: "Off" }, { id: "15m", label: "Every 15 minutes" },
          { id: "1h", label: "Hourly" }, { id: "24h", label: "Every 24 hours" },
        ]}/>
      </div>
      <div className="settings-actions"><Button isDisabled={busy || !validThreshold} onPress={() => void submit({ type: "settings.update", threshold: thresholdValue, schedule })}>Save preferences</Button></div>
      {view.settings.pauseReason && <p className="error" role="alert">{view.settings.pauseReason}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="setting-block account-block"><h3>Delete account</h3>
        <p>Removes your rules, history, and saved keys.</p>
        <Button variant="danger" className="account-delete-button" data-confirming={confirm || undefined} aria-label={confirm ? "Confirm delete account" : "Delete account"} isDisabled={busy}
          onBlur={() => setConfirm(false)}
          onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setConfirm(false); } }}
          onPress={async () => {
            if (!confirm) { confirmStarted.current = performance.now(); setConfirm(true); return; }
            if (performance.now() - confirmStarted.current < 300) return;
            if (await submit({ type: "account.delete" })) { await authClient.signOut(); location.reload(); }
          }}>
          <span className="delete-button-label" aria-hidden="true"><Trash2 size={16}/>Delete account</span>
          <span className="delete-button-confirm" aria-hidden="true"><Check size={16}/>Confirm delete</span>
        </Button>
      </div>
    </section>
  </div>;
}
