import { createGateway, experimental_evaluate } from "ai";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import type { KeyProvider, RuleSnapshot } from "./schema";

export type MailContext = {
  from: string;
  to: string;
  subject: string;
  date: string;
  owner: string;
  body: string;
};

export function firstMatch(probabilities: number[], threshold: number) {
  if (probabilities.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return -1;
  return probabilities.findIndex((value) => value >= threshold / 100);
}

export async function decide(context: MailContext, rules: RuleSnapshot[], threshold: number, apiKey: string, keyProvider: KeyProvider = "typesafe") {
  if (!rules.length) return { index: -1, probabilities: [] as number[] };
  const model = keyProvider === "vercel"
    ? createGateway({ apiKey }).evaluationModel("typesafe-ai/jev")
    : createTypeSafeAi({ apiKey }).evaluationModel("jev-latest");
  const questions = Object.fromEntries(rules.map((rule, index) => [
    `rule_${index}`,
    { type: "boolean" as const, instructions: rule.question },
  ]));
  const result = await experimental_evaluate({
    model,
    state: { email: context },
    questions,
    abortSignal: AbortSignal.timeout(30_000),
  });
  const probabilities = rules.map((_, index) => {
    const answer = result.answers[`rule_${index}`];
    if (!answer || answer.type !== "boolean" || typeof answer.probability !== "number" || !Number.isFinite(answer.probability) || answer.probability < 0 || answer.probability > 1) {
      throw new Error("Invalid model response");
    }
    return answer.probability;
  });
  return { index: firstMatch(probabilities, threshold), probabilities };
}
