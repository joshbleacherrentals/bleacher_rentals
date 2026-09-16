import { describe, expect, it } from "vitest";
import { panelPosition } from "./panelPosition";

const card = { top: 300, bottom: 332, left: 120, width: 240 };

/** Plenty of room below, so nothing is ever tempted to flip. */
const roomy = { panelHeight: 200, viewportHeight: 1000 };

describe("panelPosition without a dialog", () => {
  it("places the panel under the card in page coordinates", () => {
    expect(panelPosition(card, null, { x: 0, y: 80 }, roomy)).toEqual({
      top: 412,
      left: 120,
      width: 240,
      placement: "below",
    });
  });

  it("keeps the card's width", () => {
    expect(panelPosition(card, null, { x: 0, y: 0 }, roomy).width).toBe(240);
  });

  it("flips above the card when the panel would run off the bottom of the viewport", () => {
    // 360 tall, but only 1000 - 332 = 668... so shrink the viewport instead.
    const result = panelPosition(
      card,
      null,
      { x: 0, y: 80 },
      {
        panelHeight: 360,
        viewportHeight: 500,
      },
    );

    // Above: the card's top (300) minus the panel's height (360), plus page scroll (80).
    expect(result).toEqual({ top: 20, left: 120, width: 240, placement: "above" });
  });

  it("stays below when there is no more room above than below", () => {
    const result = panelPosition(
      card,
      null,
      { x: 0, y: 0 },
      {
        panelHeight: 400,
        viewportHeight: 640,
      },
    );

    // Neither side fits (308 below, 300 above); below is no worse, so it does not jump.
    expect(result.placement).toBe("below");
  });
});

describe("panelPosition inside a dialog", () => {
  const host = {
    rect: { top: 100, bottom: 700, left: 40, width: 600 },
    scrollTop: 50,
    scrollLeft: 0,
  };

  it("positions relative to the dialog, which scrolls independently of the page", () => {
    // 332 - 100 + 50 down, 120 - 40 across. The page's own scroll is irrelevant inside a dialog.
    expect(panelPosition(card, host, { x: 0, y: 80 }, roomy)).toEqual({
      top: 282,
      left: 80,
      width: 240,
      placement: "below",
    });
  });

  it("flips above when the dialog has no room left below the card", () => {
    const result = panelPosition(
      card,
      host,
      { x: 0, y: 80 },
      {
        panelHeight: 360,
        viewportHeight: 1000,
      },
    );

    // Only 700 - 332 = 368 of dialog below... still fits. Shrink the dialog to force the flip.
    expect(result.placement).toBe("below");

    const tight = { ...host, rect: { ...host.rect, bottom: 420 } };
    const flipped = panelPosition(
      card,
      tight,
      { x: 0, y: 80 },
      {
        panelHeight: 300,
        viewportHeight: 1000,
      },
    );

    // Above, in dialog coordinates: 300 - 100 + 50 - 300.
    expect(flipped).toEqual({ top: -50, left: 80, width: 240, placement: "above" });
  });

  it("measures against the viewport when the dialog runs past the bottom of the screen", () => {
    const result = panelPosition(
      card,
      host,
      { x: 0, y: 0 },
      {
        panelHeight: 300,
        viewportHeight: 400,
      },
    );

    // The dialog claims room down to 700, but the screen ends at 400 — only 68 is really there.
    expect(result.placement).toBe("above");
  });
});
