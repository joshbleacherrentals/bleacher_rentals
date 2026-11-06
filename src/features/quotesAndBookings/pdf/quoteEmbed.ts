/**
 * What the customer page and the invoice page that frames it say to each other, and the one test
 * the app's shell and the customer page agree on. Nothing here touches the DOM except
 * `isSameOriginFrom`, which reads the page's own origin.
 * docs/specs/accountant-collections-16-customer-page-view.md §3.
 */

export const EMBED_PARAM = "embed";
export const TAB_PARAM = "tab";

export type EmbedTab = "quote" | "contract" | "pay";

const EMBED_TABS: readonly EmbedTab[] = ["quote", "contract", "pay"];

export function parseEmbedTab(raw: unknown): EmbedTab | null {
  return EMBED_TABS.find((tab) => tab === raw) ?? null;
}

export type ToChildMessage = { type: "quote-embed:set-tab"; tab: EmbedTab };
export type ToParentMessage =
  | { type: "quote-embed:ready" }
  | { type: "quote-embed:height"; height: number };

function asRecord(data: unknown): Record<string, unknown> | null {
  return typeof data === "object" && data !== null && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

/** The invoice page's message to the frame. Anything else gives `null`. */
export function parseToChild(data: unknown): ToChildMessage | null {
  const message = asRecord(data);
  if (message?.type !== "quote-embed:set-tab") return null;
  const tab = parseEmbedTab(message.tab);
  return tab ? { type: "quote-embed:set-tab", tab } : null;
}

/** The frame's message to the invoice page. Anything else gives `null`. */
export function parseToParent(data: unknown): ToParentMessage | null {
  const message = asRecord(data);
  if (message?.type === "quote-embed:ready") return { type: "quote-embed:ready" };
  if (message?.type === "quote-embed:height") {
    const { height } = message;
    return typeof height === "number" && Number.isFinite(height) && height >= 0
      ? { type: "quote-embed:height", height }
      : null;
  }
  return null;
}

/**
 * Whether a `message` event came from the window we expect, on this page's own origin. A message
 * from another origin or another window is never ours.
 */
export function isSameOriginFrom(
  event: { origin: string; source: unknown },
  expectedSource: unknown,
): boolean {
  if (expectedSource == null || event.source !== expectedSource) return false;
  return event.origin === globalThis.location?.origin;
}

/** A path under `/quote/` with `embed=1`: the page as the invoice page frames it. */
export function isEmbeddedQuotePage(
  pathname: string,
  searchParams: { get(name: string): string | null } | null,
): boolean {
  return pathname.startsWith("/quote/") && searchParams?.get(EMBED_PARAM) === "1";
}

/** The tracker, or one that does nothing when the page is embedded (nothing is recorded). */
export function trackUnlessEmbedded<A extends unknown[]>(
  embedded: boolean,
  track: (...args: A) => void,
): (...args: A) => void {
  return embedded ? () => {} : track;
}
