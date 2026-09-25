"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

export function QuestionComposer({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let previousTop = element.getBoundingClientRect().top;
    let animation: Animation | undefined;
    const observer = new ResizeObserver(() => {
      const transform = getComputedStyle(element).transform;
      const offset = transform === "none" ? 0 : new DOMMatrixReadOnly(transform).m42;
      const top = element.getBoundingClientRect().top - offset;
      const delta = previousTop - top + offset;
      previousTop = top;
      if (Math.abs(delta) < 0.5) return;
      animation?.cancel();
      if (reducedMotion.matches) return;
      animation = element.animate([
        { transform: `translateY(${delta}px)` },
        { transform: "translateY(0)" },
      ], { duration: 620, easing: "cubic-bezier(.22, 1, .36, 1)" });
    });
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    return () => { observer.disconnect(); animation?.cancel(); };
  }, []);

  return <div ref={ref} className="question-composer">{children}</div>;
}
