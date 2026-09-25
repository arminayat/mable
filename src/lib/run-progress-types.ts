import type { RuleActions, RuleSnapshot, RunStatus } from "./schema";

export type RunItem = {
  id: string; messageId: string; position: number; state: string; phase: string;
  probabilities: number[] | null; actions: RuleActions | null;
};
export type RunProgress = {
  id: string; status: RunStatus; discovered: boolean; error: string | null;
  total: number; processed: number; changed: number; skipped: number; failed: number;
  threshold: number; rules: RuleSnapshot[]; items: RunItem[];
};
export type EmailPreview = { subject: string; from: string; excerpt: string };
