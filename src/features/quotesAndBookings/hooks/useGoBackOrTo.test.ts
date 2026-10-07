import { describe, it, expect } from "vitest";
import { shouldGoBack } from "./useGoBackOrTo";

// The card's "back" follows the browser history, so a card opened from the list returns to that
// list with its filters, and one opened from /accountant returns there with its tab and page.
// The hook itself is thin wiring over router.back() / router.push(); the decision is this.
describe("shouldGoBack", () => {
  it("goes back when the browser has in-app history", () => {
    expect(shouldGoBack(2)).toBe(true);
    expect(shouldGoBack(10)).toBe(true);
  });

  it("falls back when the page is the only entry: a new tab or a forwarded link (D7)", () => {
    expect(shouldGoBack(1)).toBe(false);
  });

  it("falls back for a history length that makes no sense", () => {
    expect(shouldGoBack(0)).toBe(false);
    expect(shouldGoBack(-1)).toBe(false);
    expect(shouldGoBack(Number.NaN)).toBe(false);
  });
});
