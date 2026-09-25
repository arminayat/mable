import { describe, expect, it } from "vitest";
import { iconMorphGeometry, type Box } from "../src/components/icon-morph-geometry";

// Badge padding and button centering differ. Recover the actual screen geometry
// after BOTH nested transforms, rather than testing the transform strings.
describe("icon morph geometry", () => {
  const scenarios = [
    { name: "desktop badge", source: { left: 360, top: 210, width: 33, height: 33 }, icon: { left: 368, top: 218, width: 17, height: 17 }, size: 56 },
    { name: "mobile badge", source: { left: 45, top: 170, width: 25, height: 25 }, icon: { left: 49, top: 174, width: 17, height: 17 }, size: 48 },
    { name: "off-center source", source: { left: 400, top: 240, width: 40, height: 34 }, icon: { left: 403, top: 248, width: 16, height: 18 }, size: 56 },
  ];
  for (const scenario of scenarios) {
    it(`keeps ${scenario.name} on a continuous path and lands exactly`, () => {
      const target: Box = { left: 220, top: 320, width: scenario.size, height: scenario.size };
      const targetIcon: Box = { left: target.left + (target.width - 26) / 2, top: target.top + (target.height - 26) / 2, width: 26, height: 26 };
      for (let step = 0; step <= 60; step++) {
        const progress = step / 60;
        const { button, icon } = iconMorphGeometry(scenario.source, target, scenario.icon, targetIcon, progress);
        const actual: Box = {
          left: target.left + button.x + (targetIcon.left - target.left + icon.x) * button.scaleX,
          top: target.top + button.y + (targetIcon.top - target.top + icon.y) * button.scaleY,
          width: targetIcon.width * icon.scaleX * button.scaleX,
          height: targetIcon.height * icon.scaleY * button.scaleY,
        };
        for (const key of ["left", "top", "width", "height"] as const) {
          expect(actual[key]).toBeCloseTo(scenario.icon[key] + (targetIcon[key] - scenario.icon[key]) * progress, 8);
        }
      }
      expect(iconMorphGeometry(scenario.source, target, scenario.icon, targetIcon, 1)).toEqual({
        button: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
        icon: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
      });
    });
  }
});


describe("collapse geometry", () => {
  it.each([33, 25])("returns expanded controls to a %ipx badge without a final snap", (size) => {
    const editor: Box = { left: 380, top: 350, width: 56, height: 56 };
    const editorIcon: Box = { left: 395, top: 365, width: 26, height: 26 };
    const card: Box = { left: 355, top: 208, width: size, height: size };
    const cardIcon: Box = { left: card.left + (size - 17) / 2, top: card.top + (size - 17) / 2, width: 17, height: 17 };
    for (let step = 0; step <= 60; step++) {
      const progress = step / 60;
      const { button, icon } = iconMorphGeometry(editor, card, editorIcon, cardIcon, progress);
      expect(card.left + button.x + (cardIcon.left - card.left + icon.x) * button.scaleX).toBeCloseTo(editorIcon.left + (cardIcon.left - editorIcon.left) * progress, 8);
      expect(card.top + button.y + (cardIcon.top - card.top + icon.y) * button.scaleY).toBeCloseTo(editorIcon.top + (cardIcon.top - editorIcon.top) * progress, 8);
      expect(cardIcon.width * button.scaleX * icon.scaleX).toBeCloseTo(26 - 9 * progress, 8);
      expect(cardIcon.height * button.scaleY * icon.scaleY).toBeCloseTo(26 - 9 * progress, 8);
    }
    expect(iconMorphGeometry(editor, card, editorIcon, cardIcon, 1)).toEqual({
      button: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
      icon: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    });
  });
});
