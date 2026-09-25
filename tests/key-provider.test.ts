import { expect, it } from "vitest";
import { detectKeyProvider } from "../src/lib/key-provider";

it.each([
  ["vck_example", "vercel"], ["  vck_example \n", "vercel"],
  ["tsk_example", "typesafe"], ["other-key", "typesafe"],
  ["prefix_vck_example", "typesafe"], ["VCK_example", "typesafe"],
])("routes %s to %s", (key, provider) => {
  expect(detectKeyProvider(key)).toBe(provider);
});
