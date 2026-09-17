/** Just the parts of a DOMRect this math needs. */
export type Rect = { top: number; bottom: number; left: number; width: number };

export type PanelHost = {
  rect: Rect;
  scrollTop: number;
  scrollLeft: number;
};

export type PanelLayout = {
  /**
   * How tall the panel would be if nothing constrained it — its full content, list included.
   * 0 before the first measurement, which is read as "as tall as it is allowed to get".
   */
  contentHeight: number;
  viewportHeight: number;
};

export type Placement = "below" | "above";

export type PanelPosition = {
  top: number;
  left: number;
  width: number;
  placement: Placement;
  /** Cap for the panel's height; its list scrolls inside whatever is left. */
  maxHeight: number;
};

/** Breathing room between the card and the panel. */
const CARD_GAP = 4;

/**
 * Room left between the panel and the edge it stops against. Bigger than CARD_GAP on purpose: a
 * panel flush against the bottom of the screen reads as if it carries on past it.
 */
const EDGE_MARGIN = 16;

/** However much room there is, a panel taller than this is unwieldy. */
export const PANEL_MAX_HEIGHT = 384;

/** Below this a panel shows nothing useful, so it is allowed to overlap rather than shrink. */
const PANEL_MIN_HEIGHT = 120;

/**
 * Where EntitySearchSelect's floating panel goes and how tall it may be: directly under its card
 * and as wide as it, flipped above when it would not fit below, and always capped to the room on
 * the side it ends up on, stopping short of the edge — a panel that overflows its dialog gets its
 * search box clipped off, and one flush against the bottom of the screen reads as if it carries
 * on past it. Both are worse than a shorter list that scrolls.
 *
 * `host` is the dialog the picker sits in, when it sits in one — the panel is then positioned in
 * that dialog's own coordinate space (it scrolls independently of the page) and the room is
 * measured against the dialog, not the whole page. `null` means the panel is parked on the body,
 * where page scroll is what counts.
 *
 * When the panel fits on neither side it stays below, because flipping to an equally cramped
 * position only moves the problem.
 */
export function panelPosition(
  card: Rect,
  host: PanelHost | null,
  pageScroll: { x: number; y: number },
  layout: PanelLayout,
): PanelPosition {
  // Both sides are measured in viewport coordinates: a dialog can extend past the bottom of the
  // screen, and the room that is actually on screen is what the panel has to live in.
  const bottomEdge = host
    ? Math.min(host.rect.bottom, layout.viewportHeight)
    : layout.viewportHeight;
  const topEdge = host ? Math.max(host.rect.top, 0) : 0;
  const spaceBelow = bottomEdge - card.bottom - CARD_GAP - EDGE_MARGIN;
  const spaceAbove = card.top - topEdge - CARD_GAP - EDGE_MARGIN;

  const wanted = Math.min(layout.contentHeight || PANEL_MAX_HEIGHT, PANEL_MAX_HEIGHT);
  const placement: Placement = wanted > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";

  const maxHeight = Math.max(placement === "above" ? spaceAbove : spaceBelow, PANEL_MIN_HEIGHT);
  const height = Math.min(wanted, maxHeight);
  const edge = placement === "above" ? card.top - CARD_GAP - height : card.bottom + CARD_GAP;

  if (host) {
    return {
      top: edge - host.rect.top + host.scrollTop,
      left: card.left - host.rect.left + host.scrollLeft,
      width: card.width,
      placement,
      maxHeight,
    };
  }

  return {
    top: edge + pageScroll.y,
    left: card.left + pageScroll.x,
    width: card.width,
    placement,
    maxHeight,
  };
}
