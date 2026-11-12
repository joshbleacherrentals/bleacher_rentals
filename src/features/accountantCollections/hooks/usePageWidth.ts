"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Measures `element.clientWidth` now and on every change of its size, and tells `onWidth`. Returns
 * the function that stops watching. Without a `ResizeObserver` (an old browser, a test) nothing is
 * measured, so the width stays unknown to the caller. Apart from the hook only so that it can be
 * tested without a DOM.
 */
export function watchWidth(element: HTMLElement, onWidth: (width: number) => void): () => void {
  if (typeof ResizeObserver === "undefined") return () => {};
  const measure = () => onWidth(element.clientWidth);
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  return () => observer.disconnect();
}

/**
 * The width of the box that `ref` is put on, or `null` until it is measured. A `ResizeObserver`
 * and not a CSS container query: a container-query box becomes the containing block of its
 * `position: fixed` descendants, and the New Task window is one of them.
 * docs/specs/accountant-collections-22-side-task-buttons.md §1 and §3.
 */
export function usePageWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    return watchWidth(element, setWidth);
  }, []);

  return { ref, width };
}
