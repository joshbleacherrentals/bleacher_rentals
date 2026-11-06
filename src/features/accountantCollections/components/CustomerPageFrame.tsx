"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  EMBED_PARAM,
  TAB_PARAM,
  isSameOriginFrom,
  parseToParent,
  type EmbedTab,
  type ToChildMessage,
} from "@/features/quotesAndBookings/pdf/quoteEmbed";

/**
 * The customer's page (`/quote/<id>`), live, under the invoice header. The page and this frame talk
 * by `postMessage` on the same origin: the page says it is ready and how tall it is (so only the
 * invoice page scrolls), and this side tells it which tab to show.
 * docs/specs/accountant-collections-16-customer-page-view.md §3.
 */

export const MIN_FRAME_HEIGHT = 480;

export function frameSrc(eventId: string, tab: EmbedTab): string {
  return `/quote/${encodeURIComponent(eventId)}?${EMBED_PARAM}=1&${TAB_PARAM}=${tab}`;
}

export type FrameAction =
  | { kind: "send-tab"; tab: EmbedTab }
  | { kind: "set-height"; height: number }
  | null;

/** What a message from the frame asks of this side; anything that is not the page's own is ignored. */
export function onFrameMessage(data: unknown, currentTab: EmbedTab): FrameAction {
  const message = parseToParent(data);
  if (!message) return null;
  if (message.type === "quote-embed:ready") return { kind: "send-tab", tab: currentTab };
  return { kind: "set-height", height: Math.max(MIN_FRAME_HEIGHT, message.height) };
}

function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function CustomerPageFrameView({
  online,
  src,
  height,
  loaded,
  frameRef,
}: {
  online: boolean;
  src: string;
  height: number;
  loaded: boolean;
  frameRef?: React.Ref<HTMLIFrameElement>;
}) {
  if (!online) {
    return (
      <p role="status" className="py-16 text-center text-sm text-gray-500">
        The customer page needs a connection.
      </p>
    );
  }
  return (
    <div className="relative">
      {!loaded && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 text-center text-sm text-gray-400">
          Loading customer page…
        </p>
      )}
      <iframe
        ref={frameRef}
        title="Customer page"
        src={src}
        style={{ height }}
        className="block w-full border-0"
      />
    </div>
  );
}

export function CustomerPageFrame({ eventId, tab }: { eventId: string; tab: EmbedTab }) {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  // Fixed at mount, so changing the tab does not reload the page: the tab goes by message.
  const [src] = useState(() => frameSrc(eventId, tab));
  const [height, setHeight] = useState(MIN_FRAME_HEIGHT);
  const [loaded, setLoaded] = useState(false);

  const tabRef = useRef(tab);
  const sendTab = useCallback((next: EmbedTab) => {
    const message: ToChildMessage = { type: "quote-embed:set-tab", tab: next };
    frameRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    tabRef.current = tab;
    sendTab(tab);
  }, [tab, sendTab]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isSameOriginFrom(event, frameRef.current?.contentWindow)) return;
      const action = onFrameMessage(event.data, tabRef.current);
      if (action?.kind === "send-tab") sendTab(action.tab);
      if (action?.kind === "set-height") {
        setHeight(action.height);
        setLoaded(true);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendTab]);

  return (
    <CustomerPageFrameView
      online={online}
      src={src}
      height={height}
      loaded={loaded}
      frameRef={frameRef}
    />
  );
}
