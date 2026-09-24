import type { RuleActions, RunScope, RunStatus } from "@/lib/schema";

export type Rule = { id: string; position: number; question: string; actions: RuleActions; enabled: boolean };
export type Label = { id: string; name: string };
export type Run = { id: string; scope: RunScope; status: RunStatus; processed: number; changed: number; skipped: number; failed: number; error: string | null };
export type View = {
  rules: Rule[];
  labels: Label[];
  settings: { threshold: number; schedule: string; hasKey: boolean; pauseReason: string | null };
  run: Run | null;
  gmailConnected: boolean;
};
export type Command = (payload: Record<string, unknown>) => Promise<unknown>;
