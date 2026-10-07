import { describe, expect, it } from "vitest";
import { sidewaysWheelScrollLeft } from "./sidewaysWheel";

const PIXELS = 0;
const LINES = 1;
const PAGES = 2;

const overflowing = { scrollLeft: 100, scrollWidth: 1000, clientWidth: 400 };

describe("sidewaysWheelScrollLeft", () => {
  it("moves the row by the wheel's pixel delta", () => {
    expect(sidewaysWheelScrollLeft({ deltaX: 0, deltaY: 40, deltaMode: PIXELS }, overflowing)).toBe(
      140,
    );
    expect(
      sidewaysWheelScrollLeft({ deltaX: 0, deltaY: -40, deltaMode: PIXELS }, overflowing),
    ).toBe(60);
  });

  it("converts a wheel that reports lines (Firefox) into pixels", () => {
    // 3 lines is one notch of a plain mouse wheel in Firefox: it must not read as 3px.
    const next = sidewaysWheelScrollLeft({ deltaX: 0, deltaY: 3, deltaMode: LINES }, overflowing);
    expect(next).toBeGreaterThan(100 + 30);
  });

  it("converts a wheel that reports pages into the row's own width", () => {
    expect(sidewaysWheelScrollLeft({ deltaX: 0, deltaY: 1, deltaMode: PAGES }, overflowing)).toBe(
      500,
    );
  });

  it("leaves a horizontal gesture (trackpad swipe) to the browser", () => {
    expect(
      sidewaysWheelScrollLeft({ deltaX: 30, deltaY: 5, deltaMode: PIXELS }, overflowing),
    ).toBeNull();
    expect(
      sidewaysWheelScrollLeft({ deltaX: 5, deltaY: 5, deltaMode: PIXELS }, overflowing),
    ).toBeNull();
  });

  it("clamps to the ends of the row", () => {
    expect(
      sidewaysWheelScrollLeft(
        { deltaX: 0, deltaY: 5000, deltaMode: PIXELS },
        { ...overflowing, scrollLeft: 500 },
      ),
    ).toBe(600);
    expect(
      sidewaysWheelScrollLeft({ deltaX: 0, deltaY: -5000, deltaMode: PIXELS }, overflowing),
    ).toBe(0);
  });

  it("hands the wheel back to the page once the row is at the end it points to", () => {
    const atStart = { scrollLeft: 0, scrollWidth: 1000, clientWidth: 400 };
    const atEnd = { scrollLeft: 600, scrollWidth: 1000, clientWidth: 400 };
    expect(
      sidewaysWheelScrollLeft({ deltaX: 0, deltaY: -40, deltaMode: PIXELS }, atStart),
    ).toBeNull();
    expect(sidewaysWheelScrollLeft({ deltaX: 0, deltaY: 40, deltaMode: PIXELS }, atEnd)).toBeNull();
  });

  it("does nothing when the chips all fit", () => {
    expect(
      sidewaysWheelScrollLeft(
        { deltaX: 0, deltaY: 40, deltaMode: PIXELS },
        { scrollLeft: 0, scrollWidth: 400, clientWidth: 400 },
      ),
    ).toBeNull();
  });
});
