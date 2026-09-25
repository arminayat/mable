import { flushSync } from "react-dom";
import { iconMorphGeometry, transform } from "./icon-morph-geometry";

const easing = "cubic-bezier(.22, 1, .36, 1)";
const duration = 620;
const properties = ["padding", "color", "backgroundColor", "borderRadius", "borderColor", "borderWidth", "borderStyle"] as const;

function freeze(source: Element, copy: Element) {
  const style = getComputedStyle(source);
  for (const property of Array.from(style)) (copy as HTMLElement).style.setProperty(property, style.getPropertyValue(property));
  copy.removeAttribute("id");
  Array.from(source.children).forEach((child, index) => freeze(child, copy.children[index]));
}

function snapshot(source: HTMLElement) {
  const rect = source.getBoundingClientRect();
  const ghost = source instanceof HTMLTextAreaElement ? document.createElement("div") : source.cloneNode(true) as HTMLElement;
  freeze(source, ghost);
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  Object.assign(ghost.style, { position: "fixed", zIndex: "40", pointerEvents: "none", margin: "0", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, minWidth: "0", maxWidth: "none", boxSizing: "border-box", transition: "none", animation: "none", transform: "none", overflow: "hidden" });
  return ghost;
}

function textLayout(element: HTMLElement) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  const input = element instanceof HTMLTextAreaElement;
  return {
    left: style.paddingLeft,
    top: input ? `${parseFloat(style.paddingTop) - element.scrollTop}px` : `${(rect.height - lineHeight) / 2 - parseFloat(style.borderTopWidth)}px`,
    width: `${element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`,
    fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: `${lineHeight}px`,
  };
}

export function expandRule(row: HTMLElement, commit: () => void) {
  void transitionRule(row, commit, true);
}

export function collapseRule(row: HTMLElement, commit: () => void) {
  return transitionRule(row, commit, false);
}

/** Animate the real destination icons in either direction, on one overlapping timeline. */
async function transitionRule(row: HTMLElement, commit: () => void, expanding: boolean) {
  const focus = () => row.querySelector<HTMLElement>(expanding ? "textarea" : ".question-text")?.focus({ preventScroll: true });
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { flushSync(commit); focus(); return; }
  const height = row.getBoundingClientRect().height;
  const sources = Array.from(row.querySelectorAll<HTMLElement>(expanding
    ? ".question-text, .row-icon[data-action], .toggle, .delete-rule"
    : "textarea, .action-choice[data-action], .toggle, .delete-rule"));
  const copies = sources.map((source) => {
    const rect = source.getBoundingClientRect();
    const style = getComputedStyle(source);
    const isQuestion = source.matches(".question-text, textarea");
    const selector = isQuestion ? (expanding ? "textarea" : ".question-text") : source.dataset.action
      ? `${expanding ? ".action-choice" : ".row-icon"}[data-action="${source.dataset.action}"]`
      : source.matches(".toggle") ? ".toggle" : ".delete-rule";
    const ghost = snapshot(source);
    let text: HTMLSpanElement | undefined;
    if (isQuestion) {
      text = document.createElement("span");
      text.textContent = source instanceof HTMLTextAreaElement ? source.value : source.textContent;
      Object.assign(text.style, textLayout(source), { position: "absolute", whiteSpace: "pre-wrap", textAlign: "left" });
      ghost.replaceChildren(text);
      document.body.append(ghost);
    }
    return { ghost, selector, rect, text, action: source.dataset.action, iconRect: source.querySelector("svg")?.getBoundingClientRect(), radius: parseFloat(style.borderRadius) };
  });
  const leaving = expanding ? [] : Array.from(row.querySelectorAll<HTMLElement>(".label-line, .editor-footer, .error")).map(snapshot);
  const animations: Animation[] = [];
  const visible = new Map<HTMLElement, string>();
  const previousVisibility = row.style.visibility;
  const previousInert = row.inert;
  const show = (element: HTMLElement) => {
    visible.set(element, element.style.visibility);
    element.style.visibility = "visible";
  };
  try {
    flushSync(commit);
    row.inert = true;
    row.style.visibility = "hidden";
    row.dataset.transitioning = "true";
    const finalHeight = row.getBoundingClientRect().height;
    // Read all destination geometry before starting any animations.
    const targets = copies.map((copy) => {
      const target = row.querySelector<HTMLElement>(copy.selector);
      if (!target) return { copy };
      const rect = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      const icon = target.querySelector<SVGElement>("svg");
      const end: Record<string, string> = { transform: `translate(${rect.left - copy.rect.left}px, ${rect.top - copy.rect.top}px)`, width: `${rect.width}px`, height: `${rect.height}px` };
      properties.forEach((property) => { end[property] = style[property]; });
      return { copy, target, rect, icon, iconRect: icon?.getBoundingClientRect(), radius: parseFloat(style.borderRadius), end, text: copy.text ? textLayout(target) : undefined };
    });
    const startTime = document.timeline.currentTime;
    const animate = (element: Element, frames: Keyframe[], delay: number, length = duration) => {
      const animation = element.animate(frames, { duration: length, delay, easing, fill: "both" });
      animation.startTime = startTime;
      animations.push(animation);
      return animation.finished;
    };
    const reveal = (element: HTMLElement, delay: number) => {
      show(element);
      return animate(element, [{ opacity: 0, transform: "translateY(8px) scale(.94)" }, { opacity: 1, transform: "none" }], delay, 420);
    };
    const fade = (ghost: HTMLElement) => {
      document.body.append(ghost);
      return animate(ghost, [{ opacity: 1 }, { opacity: 0, transform: "translateY(-6px) scale(.94)" }], 0, 180);
    };
    const pending: Promise<unknown>[] = [animate(row, [{ height: `${height}px` }, { height: `${finalHeight}px` }], expanding ? 0 : 80), ...leaving.map(fade)];
    for (const destination of targets) {
      const { copy, target, rect, icon, iconRect, radius, end } = destination;
      if (!target || !rect || !end) { pending.push(fade(copy.ghost)); continue; }
      const actionIndex = ["read", "star", "archive", "label"].indexOf(copy.action ?? "");
      const delay = expanding
        ? copy.text ? 60 : actionIndex >= 0 ? 140 + actionIndex * 55 : copy.selector === ".toggle" ? 330 : 385
        : copy.text ? 100 : actionIndex >= 0 ? 80 + (3 - actionIndex) * 45 : copy.selector === ".toggle" ? 0 : 55;
      if (copy.iconRect && icon && iconRect && radius !== undefined) {
        const frames = Array.from({ length: 61 }, (_, index) => {
          const progress = index / 60;
          const geometry = iconMorphGeometry(copy.rect, rect, copy.iconRect!, iconRect, progress);
          const corner = copy.radius + (radius - copy.radius) * progress;
          return {
            button: { offset: progress, transform: transform(geometry.button), transformOrigin: "0 0", borderRadius: `${corner / geometry.button.scaleX}px / ${corner / geometry.button.scaleY}px` },
            icon: { offset: progress, transform: transform(geometry.icon), transformOrigin: "0 0", transformBox: "border-box" },
          };
        });
        show(target);
        pending.push(animate(target, frames.map((frame) => frame.button), delay), animate(icon, frames.map((frame) => frame.icon), delay));
      } else if (copy.text && destination.text) {
        pending.push(Promise.all([
          animate(copy.text, [{}, destination.text], delay),
          animate(copy.ghost, [{}, end], delay),
        ]).then(() => { show(target); copy.ghost.remove(); }));
      }
    }
    if (expanding) {
      row.querySelectorAll<HTMLElement>(".action-choice").forEach((target, index) => {
        if (!copies.some((copy) => target.matches(copy.selector))) pending.push(reveal(target, 140 + index * 55));
      });
      row.querySelectorAll<HTMLElement>(".label-line, .editor-footer").forEach((target) => pending.push(reveal(target, 450)));
    } else {
      const handle = row.querySelector<HTMLElement>(".reorder-handle");
      if (handle) pending.push(reveal(handle, 420));
    }
    await Promise.all(pending);
  } catch {
    // Motion failure must not undo a persisted edit or leave controls hidden.
  } finally {
    animations.forEach((animation) => animation.cancel());
    copies.forEach(({ ghost }) => ghost.remove());
    leaving.forEach((ghost) => ghost.remove());
    row.style.visibility = previousVisibility;
    visible.forEach((visibility, element) => { element.style.visibility = visibility; });
    delete row.dataset.transitioning;
    row.inert = previousInert;
    if (row.isConnected) focus();
  }
}
