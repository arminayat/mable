"use client";

import { useRef, type PointerEvent } from "react";
import { GripVertical } from "lucide-react";

export function ReorderHandle({ index, count, move }: {
  index: number; count: number; move: (offset: number) => void;
}) {
  const drag = useRef<{ startY: number; target: number; row: HTMLElement; rows: HTMLElement[]; centers: number[] } | null>(null);

  function finish(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    current.row.removeAttribute("data-dragging");
    current.rows.forEach((row) => {
      if (!cancelled) row.style.transition = "none";
      row.style.removeProperty("transform");
    });
    if (!cancelled) requestAnimationFrame(() => requestAnimationFrame(() => {
      current.rows.forEach((row) => row.style.removeProperty("transition"));
    }));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && current.target !== index) move(current.target - index);
  }

  return <button className="reorder-handle" aria-label={`Reorder question ${index + 1}`} title="Drag to reorder, or use the up and down arrow keys" onKeyDown={(event) => {
    const offset = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!offset) return;
    event.preventDefault();
    if (index + offset >= 0 && index + offset < count) move(offset);
  }} onPointerDown={(event) => {
    if (event.button !== 0 || count < 2) return;
    const row = event.currentTarget.closest<HTMLElement>(".rule-row");
    if (!row?.parentElement) return;
    const rows = Array.from(row.parentElement.querySelectorAll<HTMLElement>(".rule-row"));
    drag.current = { startY: event.clientY, target: index, row, rows, centers: rows.map((item) => { const rect = item.getBoundingClientRect(); return rect.top + rect.height / 2; }) };
    event.currentTarget.setPointerCapture(event.pointerId);
    row.dataset.dragging = "true";
  }} onPointerMove={(event) => {
    const current = drag.current;
    if (!current) return;
    const delta = event.clientY - current.startY;
    const center = current.centers[index] + delta;
    current.target = current.centers.reduce((nearest, value, candidate) => Math.abs(value - center) < Math.abs(current.centers[nearest] - center) ? candidate : nearest, index);
    current.row.style.transform = `translateY(${delta}px)`;
    current.rows.forEach((row, candidate) => {
      if (candidate === index) return;
      let offset = 0;
      if (candidate > index && candidate <= current.target) offset = current.centers[candidate - 1] - current.centers[candidate];
      if (candidate < index && candidate >= current.target) offset = current.centers[candidate + 1] - current.centers[candidate];
      row.style.transform = `translateY(${offset}px)`;
    });
  }} onPointerUp={(event) => finish(event)} onPointerCancel={(event) => finish(event, true)} onLostPointerCapture={(event) => finish(event, true)}><GripVertical size={20}/></button>;
}
