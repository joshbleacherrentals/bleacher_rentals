"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { GripVertical, X } from "lucide-react";
import {
  clampRect,
  DEFAULT_RECT,
  moveRect,
  readStoredRect,
  resizeRect,
  writeStoredRect,
  type ResizeEdge,
  type Size,
  type WindowRect,
} from "../utils/windowRect";
import { NextTaskForm } from "./NextTaskForm";

/**
 * The New Task window: a floating panel, not a modal. No overlay, no focus trap, no scroll lock;
 * the page behind stays usable. Moved by its title bar, resized by its east edge (width), south
 * edge (height) and south-east corner (both). Where it was left is kept in the browser.
 * docs/specs/accountant-collections-14-new-task-window.md §3.
 */

type Gesture = {
  kind: "move" | ResizeEdge;
  pointerId: number;
  startX: number;
  startY: number;
  start: WindowRect;
};

/** The visible page, without the scrollbar: what `position: fixed` is laid out against. */
function viewportSize(): Size {
  // Outside a browser (static markup in tests) there is nothing to clamp against.
  if (typeof document === "undefined") return { w: Infinity, h: Infinity };
  return { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
}

export function NewTaskWindow({
  eventId,
  today,
  onClose,
}: {
  eventId: string;
  /** `YYYY-MM-DD`, the date in the timezone store. */
  today: string;
  onClose: () => void;
}) {
  const titleId = useId();
  // Where it was left, pulled inside this screen; only the geometry is kept, never the text.
  const [rect, setRect] = useState<WindowRect>(() =>
    clampRect(readStoredRect() ?? DEFAULT_RECT, viewportSize()),
  );
  const rectRef = useRef(rect);
  const gesture = useRef<Gesture | null>(null);

  const commit = useCallback((next: WindowRect) => {
    rectRef.current = next;
    setRect(next);
  }, []);

  // A smaller browser window pulls it in at once. Not saved: only a move or resize saves.
  useEffect(() => {
    const onResize = () => commit(clampRect(rectRef.current, viewportSize()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [commit]);

  const begin = (kind: Gesture["kind"]) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gesture.current = {
      kind,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      start: rectRef.current,
    };
  };

  const drag = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const dx = e.clientX - g.startX;
    const dy = e.clientY - g.startY;
    commit(
      g.kind === "move"
        ? moveRect(g.start, dx, dy, viewportSize())
        : resizeRect(g.start, g.kind, dx, dy, viewportSize()),
    );
  };

  // Release, `pointercancel` and a lost capture all end the gesture where it is.
  const end = (e: React.PointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    writeStoredRect(rectRef.current);
  };

  const gestureProps = (kind: Gesture["kind"]) => ({
    onPointerDown: begin(kind),
    onPointerMove: drag,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
  });

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
      className="fixed z-40 flex flex-col rounded-[10px] border border-gray-400 bg-white shadow-[0_8px_24px_rgba(15,42,68,0.14),0_24px_64px_-16px_rgba(15,42,68,0.4)]"
    >
      <div
        {...gestureProps("move")}
        className="flex shrink-0 cursor-move touch-none select-none items-center justify-between gap-3 rounded-t-[9px] bg-gradient-to-r from-gray-800 to-gray-600 py-2 pl-3 pr-2 text-white"
      >
        <span className="inline-flex items-center gap-2">
          <GripVertical className="size-4 opacity-70" aria-hidden />
          <h2 id={titleId} className="text-sm font-semibold">
            New Task
          </h2>
        </span>
        <button
          type="button"
          aria-label="Close New Task window"
          // A press on the button is a click, not the start of a move.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md bg-white/15 text-white hover:bg-white/25"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <NextTaskForm eventId={eventId} today={today} onSaved={onClose} />

      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize window width"
        {...gestureProps("e")}
        className="absolute bottom-5 top-11 -right-[5px] w-2.5 cursor-ew-resize touch-none border-0 bg-transparent p-0"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize window height"
        {...gestureProps("s")}
        className="absolute -bottom-[5px] left-3 right-5 h-2.5 cursor-ns-resize touch-none border-0 bg-transparent p-0"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Resize window"
        {...gestureProps("se")}
        className="absolute -bottom-[5px] -right-[5px] size-[22px] cursor-nwse-resize touch-none border-0 bg-transparent p-0"
      >
        <svg
          aria-hidden="true"
          width="22"
          height="22"
          viewBox="0 0 22 22"
          fill="none"
          stroke="#6b7280"
          strokeWidth="1.5"
          strokeLinecap="round"
        >
          <path d="M18 9 9 18" />
          <path d="M18 14 14 18" />
        </svg>
      </button>
    </div>
  );
}
