import { describe, it, expect } from "vitest";
import {
  PAGE_SIZE_OPTIONS,
  buildPageItems,
  getPageRange,
  getTotalPages,
  parsePage,
  parsePageSize,
  slicePage,
} from "./pagination";

describe("parsePageSize", () => {
  it("offers exactly 25 / 50 / 100 as the selectable sizes", () => {
    expect(PAGE_SIZE_OPTIONS).toEqual([25, 50, 100]);
  });

  it("accepts each offered size from the URL", () => {
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("50")).toBe(50);
    expect(parsePageSize("100")).toBe(100);
  });

  it("falls back to 25 for anything that is not an offered size", () => {
    // A hand-typed ?pageSize=7 must not render 7 rows — the selector could
    // never show that value back to the user.
    expect(parsePageSize("7")).toBe(25);
    expect(parsePageSize("abc")).toBe(25);
    expect(parsePageSize("")).toBe(25);
    expect(parsePageSize(null)).toBe(25);
  });
});

describe("parsePage", () => {
  it("reads a 1-based page number from the URL", () => {
    expect(parsePage("8")).toBe(8);
  });

  it("falls back to page 1 for missing, zero, negative or non-numeric values", () => {
    expect(parsePage(null)).toBe(1);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-3")).toBe(1);
    expect(parsePage("2.5")).toBe(1);
    expect(parsePage("last")).toBe(1);
  });
});

describe("getTotalPages", () => {
  it("counts a partial last page", () => {
    expect(getTotalPages(201, 25)).toBe(9);
    expect(getTotalPages(200, 25)).toBe(8);
  });

  it("reports one page for an empty list, so the pager never shows 'Page 1 of 0'", () => {
    expect(getTotalPages(0, 25)).toBe(1);
  });
});

describe("slicePage", () => {
  const items = Array.from({ length: 60 }, (_, i) => i + 1);

  it("returns the rows belonging to the requested page", () => {
    expect(slicePage(items, 1, 25)[0]).toBe(1);
    expect(slicePage(items, 1, 25).at(-1)).toBe(25);
    expect(slicePage(items, 3, 25)).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
  });

  it("clamps a page past the end to the last page instead of showing nothing", () => {
    // Filtering down from 8 pages to 2 must not leave the user staring at an
    // empty table because ?page=8 is still in the URL.
    expect(slicePage(items, 99, 25)).toEqual(slicePage(items, 3, 25));
  });

  it("returns an empty list when there is nothing to page through", () => {
    expect(slicePage([], 1, 25)).toEqual([]);
  });
});

describe("buildPageItems", () => {
  it("lists every page when they all fit", () => {
    expect(buildPageItems(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps a window around the current page, with the first and last always reachable", () => {
    expect(buildPageItems(1, 20)).toEqual([1, 2, 3, 4, 5, "gap", 20]);
    expect(buildPageItems(10, 20)).toEqual([1, "gap", 8, 9, 10, 11, 12, "gap", 20]);
    expect(buildPageItems(19, 20)).toEqual([1, "gap", 16, 17, 18, 19, 20]);
  });

  it("shows the page itself rather than a gap that would hide a single page", () => {
    expect(buildPageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("handles a single page", () => {
    expect(buildPageItems(1, 1)).toEqual([1]);
  });
});

describe("getPageRange", () => {
  it("reports the 1-based row range shown on the current page", () => {
    expect(getPageRange(2, 25, 213)).toEqual({ from: 26, to: 50 });
  });

  it("stops the range at the last row on a partial final page", () => {
    expect(getPageRange(9, 25, 213)).toEqual({ from: 201, to: 213 });
  });

  it("collapses to an empty range when there are no rows", () => {
    expect(getPageRange(1, 25, 0)).toEqual({ from: 0, to: 0 });
  });
});
