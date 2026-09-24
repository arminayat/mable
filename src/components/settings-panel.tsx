"use client";
import { useState } from "react";
import { Button } from "@heroui/react";
import { KeyRound, Trash2, X } from "lucide-react";
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
    <section className="panel" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="panel-head"><h2>Settings</h2><Button isIconOnly variant="ghost" aria-label="Close settings" onPress={close}><X size={18}/></Button></div>
      <div className="setting-block"><div className="setting-heading">Gmail connection</div>
        <p>{view.gmailConnected ? "Connected to your Google account." : "Reconnect to allow Gmail cleanup and scheduled runs."}</p>
        <Button variant="secondary" onPress={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}>Reconnect Google</Button>
      </div>
      <div className="setting-block"><div className="setting-heading"><KeyRound size={17}/> TypeSafe API key</div>
        <p>Your key stays encrypted on this server. Jev evaluations use your TypeSafe account.</p>
        <div className="setting-row"><input type="password" autoComplete="off" value={key} onChange={(event) => setKey(event.target.value)} placeholder={view.settings.hasKey ? "Key saved · enter a replacement" : "Paste your API key"}/><Button isDisabled={busy || key.length < 10} onPress={async () => { if (await submit({ type: "key.set", key })) setKey(""); }}>Save key</Button></div>
        {view.settings.hasKey && <button className="text-button" onClick={() => void submit({ type: "key.remove" })}>Remove saved key</button>}
      </div>
      <div className="setting-block"><label className="setting-heading" htmlFor="threshold">Match threshold · {threshold}%</label>
        <p>Minimum estimated chance that the answer is yes. It is not a guarantee of accuracy.</p>
        <input id="threshold" type="range" min="50" max="100" step="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} />
      </div>
      <div className="setting-block"><label className="setting-heading" htmlFor="schedule">Automatic cleanup</label>
        <p>Checks newly received inbox mail while you are away.</p>
        <select id="schedule" value={schedule} onChange={(event) => setSchedule(event.target.value)}>
          <option value="off">Off</option><option value="15m">Every 15 minutes</option><option value="1h">Hourly</option><option value="24h">Every 24 hours</option>
        </select>
      </div>
      <Button isDisabled={busy} onPress={() => void submit({ type: "settings.update", threshold, schedule })}>Save preferences</Button>
      {view.settings.pauseReason && <p className="error" role="alert">{view.settings.pauseReason}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="setting-block account-block"><h3>Account</h3><button className="text-button" onClick={() => void authClient.signOut().then(() => location.reload())}>Sign out</button>
        <p>Deleting your account removes your rules, run history, and saved credentials.</p>
        <input aria-label="Type DELETE to confirm account deletion" value={confirm} onChange={(event) => setConfirm(event.target.value)} placeholder="Type DELETE to confirm" />
        <Button variant="danger" isDisabled={busy || confirm !== "DELETE"} onPress={async () => { if (await submit({ type: "account.delete" })) { await authClient.signOut(); location.reload(); } }}><Trash2 size={16}/> Delete account</Button>
      </div>
    </section>
  </div>;
}
