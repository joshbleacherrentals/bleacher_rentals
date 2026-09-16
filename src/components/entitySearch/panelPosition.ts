/** Just the parts of a DOMRect this math needs. */
export type Rect = { top: number; bottom: number; left: number; width: number };

export type PanelHost = {
  rect: Rect;
  scrollTop: number;
  scrollLeft: number;
};

export type PanelLayout = {
  /** Measured height of the rendered panel; 0 before the first measurement. */
  panelHeight: number;
  viewportHeight: number;
};

export type Placement = "below" | "above";

export type PanelPosition = {
  top: number;
  left: number;
  width: number;
  placement: Placement;
};

/**
 * Where EntitySearchSelect's floating panel goes: directly under its card, as wide as it, and
 * flipped above the card when the panel would not fit below.
 *
 * `host` is the dialog the picker sits in, when it sits in one — the panel is then positioned in
 * that dialog's own coordinate space (it scrolls independently of the page) and the room below is
 * measured against the dialog, not the whole page. `null` means the panel is parked on the body,
 * where page scroll is what counts.
 *
 * When the panel fits on neither side it stays below, because flipping to an equally cramped
 * position only moves the problem. The panel is clipped by whatever scrolls it in that case.
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
  const spaceBelow = bottomEdge - card.bottom;
  const spaceAbove = card.top - topEdge;

  const placement: Placement =
    layout.panelHeight > spaceBelow && spaceAbove > spaceBelow ? "above" : "below";
  const cardEdge = placement === "above" ? card.top - layout.panelHeight : card.bottom;

  if (host) {
    return {
      top: cardEdge - host.rect.top + host.scrollTop,
      left: card.left - host.rect.left + host.scrollLeft,
      width: card.width,
      placement,
    };
  }

  return {
    top: cardEdge + pageScroll.y,
    left: card.left + pageScroll.x,
    width: card.width,
    placement,
  };
}
