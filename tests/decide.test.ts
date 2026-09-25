import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGateway, experimental_evaluate } from "ai";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { decide, firstMatch } from "../src/lib/decide";

const models = vi.hoisted(() => ({ direct: vi.fn(() => ({ provider: "direct" })), gateway: vi.fn(() => ({ provider: "gateway" })) }));
vi.mock("ai", () => ({ experimental_evaluate: vi.fn(), createGateway: vi.fn(() => ({ evaluationModel: models.gateway })) }));
vi.mock("@ai-sdk/typesafe-ai", () => ({ createTypeSafeAi: vi.fn(() => ({ evaluationModel: models.direct })) }));
const context = { from: "", to: "", subject: "", date: "", owner: "", body: "" };
const rules = [
  { id: "first", question: "Is it actionable?", actions: { star: true as const } },
  { id: "second", question: "Is it a receipt?", actions: { archive: true as const } },
];
beforeEach(() => vi.clearAllMocks());

it.each([undefined, "typesafe", "vercel"] as const)("routes %s credentials without changing evaluation semantics", async (provider) => {
  vi.mocked(experimental_evaluate).mockResolvedValueOnce({ answers: {
    rule_0: { type: "boolean", probability: 0.89 }, rule_1: { type: "boolean", probability: 0.9 },
  } } as never);
  expect(await decide(context, rules, 90, "per-user-key", provider)).toEqual({ index: 1, probabilities: [0.89, 0.9] });
  const gateway = provider === "vercel";
  expect(gateway ? createGateway : createTypeSafeAi).toHaveBeenCalledWith({ apiKey: "per-user-key" });
  expect(gateway ? createTypeSafeAi : createGateway).not.toHaveBeenCalled();
  expect(gateway ? models.gateway : models.direct).toHaveBeenCalledWith(gateway ? "typesafe-ai/jev" : "jev-latest");
  expect(experimental_evaluate).toHaveBeenCalledWith(expect.objectContaining({
    model: { provider: gateway ? "gateway" : "direct" }, state: { email: context },
    questions: { rule_0: { type: "boolean", instructions: rules[0].question }, rule_1: { type: "boolean", instructions: rules[1].question } },
    abortSignal: expect.any(AbortSignal),
  }));
});

it("never falls back to another provider when Gateway rejects a key", async () => {
  const error = Object.assign(new Error("Unauthorized"), { statusCode: 401 });
  vi.mocked(experimental_evaluate).mockRejectedValueOnce(error);
  await expect(decide(context, rules, 90, "invalid-key", "vercel")).rejects.toBe(error);
  expect(createTypeSafeAi).not.toHaveBeenCalled();
});

it.each([undefined, { type: "boolean", probability: NaN }, { type: "boolean", probability: 1.1 }, { type: "boolean", probability: "0.99" }, { type: "string", value: "yes" }])("fails closed on malformed Gateway answers: %j", async (answer) => {
  vi.mocked(experimental_evaluate).mockResolvedValueOnce({ answers: { rule_0: { type: "boolean", probability: 1 }, rule_1: answer } } as never);
  await expect(decide(context, rules, 90, "gateway-key", "vercel")).rejects.toThrow("Invalid model response");
});

describe("first matching rule", () => {
  it("uses list order among qualifying rules", () => {
    expect(firstMatch([0.95, 0.99], 90)).toBe(0);
    expect(firstMatch([0.75, 0.95], 90)).toBe(1);
  });
  it("includes the threshold and ignores invalid answers", () => {
    expect(firstMatch([0.9], 90)).toBe(0);
    expect(firstMatch([NaN, Infinity, 0.89], 90)).toBe(-1);
    expect(firstMatch([NaN, 0.95], 90)).toBe(-1);
  });
});

it("leaves a message unchanged when Jev returns an invalid answer", async () => {
  vi.mocked(experimental_evaluate).mockResolvedValueOnce({ answers: { rule_0: { type: "boolean", probability: Number.NaN } } } as never);
  await expect(decide({ from: "", to: "", subject: "", date: "", owner: "", body: "" },
    [{ id: "rule", question: "Is it actionable?", actions: { star: true } }], 90, "tsk_test"))
    .rejects.toThrow("Invalid model response");
});
