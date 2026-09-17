import { describe, expect, it } from "vitest";
import { panelPosition, PANEL_MAX_HEIGHT } from "./panelPosition";

const card = { top: 300, bottom: 332, left: 120, width: 240 };

/** A short panel with plenty of room below it, so nothing is tempted to flip or shrink. */
const roomy = { contentHeight: 200, viewportHeight: 1000 };

describe("panelPosition without a dialog", () => {
  it("places the panel under the card in page coordinates", () => {
    const result = panelPosition(card, null, { x: 0, y: 80 }, roomy);

    expect(result.placement).toBe("below");
    expect(result.top).toBe(416); // card bottom + gap + page scroll
    expect(result.left).toBe(120);
    expect(result.width).toBe(240);
  });

  it("flips above the card when the panel would run off the bottom of the viewport", () => {
    const result = panelPosition(
      card,
      null,
      { x: 0, y: 80 },
      { contentHeight: 360, viewportHeight: 500 },
    );

    expect(result.placement).toBe("above");
    // Above: the card's top (300), less the gap and the panel's height, plus page scroll.
    expect(result.top).toBe(300 - 4 - 280 + 80);
    // It only gets the room that is there: 300 above, less the gap and the edge margin.
    expect(result.maxHeight).toBe(280);
  });

  it("stays below when there is no more room above than below", () => {
    const result = panelPosition(
      card,
      null,
      { x: 0, y: 0 },
      { contentHeight: 400, viewportHeight: 640 },
    );

    // Neither side fits (288 below, 280 above); below is no worse, so it does not jump.
    expect(result.placement).toBe("below");
  });

  it("assumes a full-height panel until it has been measured", () => {
    const unmeasured = panelPosition(
      card,
      null,
      { x: 0, y: 0 },
      { contentHeight: 0, viewportHeight: 600 },
    );

    // 248 below is less than a full panel wants, and 280 above is more — so it opens upwards on
    // the very first frame, before anything has had a chance to measure it.
    expect(unmeasured.placement).toBe("above");
  });

  it("never asks for more height than the panel's own maximum", () => {
    const result = panelPosition(
      card,
      null,
      { x: 0, y: 0 },
      { contentHeight: 5000, viewportHeight: 4000 },
    );

    expect(result.top).toBe(336);
    expect(result.maxHeight).toBeGreaterThanOrEqual(PANEL_MAX_HEIGHT);
  });
});

describe("panelPosition inside a dialog", () => {
  const host = {
    rect: { top: 100, bottom: 700, left: 40, width: 600 },
    scrollTop: 50,
    scrollLeft: 0,
  };

  it("positions relative to the dialog, which scrolls independently of the page", () => {
    const result = panelPosition(card, host, { x: 0, y: 80 }, roomy);

    expect(result.placement).toBe("below");
    // 332 + 4 - 100 + 50 down, 120 - 40 across. The page's own scroll is irrelevant in a dialog.
    expect(result.top).toBe(286);
    expect(result.left).toBe(80);
  });

  it("caps the panel to the room above, instead of overflowing the top of the dialog", () => {
    const tight = { ...host, rect: { ...host.rect, bottom: 420 } };

    const result = panelPosition(
      card,
      tight,
      { x: 0, y: 80 },
      { contentHeight: 384, viewportHeight: 1000 },
    );

    expect(result.placement).toBe("above");
    // 300 - 100 of room above, less the gap and the edge margin — the list scrolls inside that.
    expect(result.maxHeight).toBe(180);
    // And it stops short of the dialog's top edge rather than running past it.
    expect(result.top).toBe(300 - 4 - 180 - 100 + 50);
    expect(result.top - host.scrollTop).toBe(16);
  });

  it("measures against the viewport when the dialog runs past the bottom of the screen", () => {
    const result = panelPosition(
      card,
      host,
      { x: 0, y: 0 },
      { contentHeight: 300, viewportHeight: 400 },
    );

    // The dialog claims room down to 700, but the screen ends at 400 — only 48 is really there.
    expect(result.placement).toBe("above");
  });

  it("keeps a usable height even where there is almost no room at all", () => {
    const squashed = {
      rect: { top: 320, bottom: 360, left: 40, width: 600 },
      scrollTop: 0,
      scrollLeft: 0,
    };

    const result = panelPosition(
      card,
      squashed,
      { x: 0, y: 0 },
      { contentHeight: 300, viewportHeight: 1000 },
    );

    // Overlapping is better than an 8px panel nobody can read.
    expect(result.maxHeight).toBe(120);
  });
});
