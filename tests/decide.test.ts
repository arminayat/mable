import { describe, expect, it, vi } from "vitest";
import { experimental_evaluate } from "ai";
import { decide, firstMatch } from "../src/lib/decide";

vi.mock("ai", () => ({ experimental_evaluate: vi.fn() }));
vi.mock("@ai-sdk/typesafe-ai", () => ({ createTypeSafeAi: () => ({ evaluationModel: () => ({}) }) }));

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
