"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QuotePublicView } from "@/features/quotesAndBookings/pdf/QuotePublicView";
import type { QuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";

// QuotePublicView is laid out for a page (max-w-4xl); it is shrunk to fit the space beside the modal.
const QUOTE_WIDTH = 896;
// While the preview shows, the modal sits at the left edge (1rem in, sm:max-w-md = 28rem wide).
const MODAL_RIGHT_EDGE = "29rem";
const MIN_USEFUL_WIDTH = 240;

/**
 * The customer's whole Approved Quote tab, filling the space to the right of the sales office
 * modal (which moves to the left edge while this is showing). Shrunk only if that space is narrower
 * than the tab.
 *
 * Portalled to the body rather than placed inside the dialog: the dialog is centred with a CSS
 * transform, which would turn `position: fixed` into "fixed to the dialog". The pointer is
 * swallowed on mouse-down so clicking it can never blur the field that opened it.
 */
export function QuotePreviewPanel({ data }: { data: QuoteDocumentData }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const scrolledToBottom = useRef(false);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(() => setWidth(box.clientWidth));
    observer.observe(box);
    setWidth(box.clientWidth);

    // The open dialog locks page scroll by cancelling wheel/touch events that land outside it.
    // Stopping them here, before they reach that lock, lets the browser scroll this panel.
    const keepFromScrollLock = (e: Event) => e.stopPropagation();
    box.addEventListener("wheel", keepFromScrollLock, { passive: true });
    box.addEventListener("touchmove", keepFromScrollLock, { passive: true });
    return () => {
      observer.disconnect();
      box.removeEventListener("wheel", keepFromScrollLock);
      box.removeEventListener("touchmove", keepFromScrollLock);
    };
  }, []);

  // The payment box is near the bottom of the tab, so open there. Waits for the first measurement
  // because the zoom, and so the height, is only right once the width is known.
  useEffect(() => {
    const box = boxRef.current;
    if (!box || width === null || scrolledToBottom.current) return;
    scrolledToBottom.current = true;
    box.scrollTop = box.scrollHeight;
  }, [width]);

  if (typeof document === "undefined") return null;

  const tooNarrow = width !== null && width < MIN_USEFUL_WIDTH;

  return createPortal(
    <div
      ref={boxRef}
      aria-hidden
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: "1rem",
        bottom: "1rem",
        left: `calc(${MODAL_RIGHT_EDGE} + 1rem)`,
        right: "1rem",
        zIndex: 60,
        // An open dialog sets pointer-events: none on the body; without this the panel ignores the wheel.
        pointerEvents: "auto",
        display: tooNarrow ? "none" : undefined,
      }}
      className="overflow-y-auto rounded-lg border border-gray-300 bg-gray-100 shadow-xl"
    >
      <p className="sticky top-0 z-10 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-white">
        Preview — Approved Quote tab (sample data)
      </p>
      <div style={{ zoom: width ? Math.min(1, width / QUOTE_WIDTH) : 1 }}>
        <QuotePublicView data={data} highlightPaymentBox />
      </div>
    </div>,
    document.body,
  );
}
