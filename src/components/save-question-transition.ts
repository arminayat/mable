import { flushSync } from "react-dom";

/** Carry the persisted question from the input into its actual list position. */
export async function moveSavedQuestion(input: HTMLInputElement | null, ruleId: string, commit: () => void) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!input || reduced) { flushSync(commit); return; }
  const start = input.getBoundingClientRect();
  const style = getComputedStyle(input);
  const ghost = document.createElement("div");
  ghost.textContent = input.value;
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed", zIndex: "30", pointerEvents: "none", boxSizing: "border-box",
    left: `${start.left}px`, top: `${start.top}px`, width: `${start.width}px`, height: `${start.height}px`,
    padding: style.padding, font: style.font, color: style.color, background: style.backgroundColor,
    border: style.border, borderRadius: style.borderRadius, overflow: "hidden", whiteSpace: "nowrap",
  });
  document.body.append(ghost);
  flushSync(commit);
  const target = document.querySelector<HTMLElement>(`[data-rule-id="${CSS.escape(ruleId)}"] .question-text`);
  if (!target) { ghost.remove(); return; }
  const controls = Array.from(target.closest(".rule-row")!.querySelectorAll<HTMLElement>(
    ".reorder-handle, .row-actions > *, .toggle, .delete-rule",
  ));
  controls.forEach((control) => {
    control.style.visibility = "hidden";
    control.inert = true;
  });
  const end = target.getBoundingClientRect();
  const targetStyle = getComputedStyle(target);
  target.style.visibility = "hidden";
  input.style.visibility = "hidden";
  try {
    await ghost.animate([
      {},
      { left: `${end.left}px`, top: `${end.top}px`, width: `${end.width}px`, height: `${end.height}px`,
        padding: targetStyle.padding, fontSize: targetStyle.fontSize, lineHeight: targetStyle.lineHeight,
        borderRadius: targetStyle.borderRadius, borderColor: "transparent", background: targetStyle.backgroundColor },
    ], { duration: 760, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "forwards" }).finished;
  } finally {
    target.style.visibility = "";
    ghost.remove();
    controls.forEach((control, index) => {
      control.style.visibility = "";
      const reveal = control.animate([
        { opacity: 0, transform: "translateY(-8px) scale(.9)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ], { duration: 420, delay: index * 110, easing: "cubic-bezier(.22, 1, .36, 1)", fill: "backwards" });
      void reveal.finished.catch(() => {}).then(() => { control.inert = false; });
    });
    input.style.visibility = "";
    input.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
  }
}
