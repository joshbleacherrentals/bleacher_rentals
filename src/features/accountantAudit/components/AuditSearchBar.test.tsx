import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditSearchBar, SEARCH_WRITE_DELAY_MS, createDebouncer } from "./AuditSearchBar";

// docs/specs/accountant-audit-05-drivers-table.md §2.3, §4 (R6).

describe("AuditSearchBar", () => {
  it("is a text box with the magnifier, the placeholder and the typed text", () => {
    const html = renderToStaticMarkup(<AuditSearchBar value="ann" onChange={() => {}} />);
    expect(html).toContain('data-testid="audit-search"');
    expect(html).toContain('placeholder="Search by driver name..."');
    expect(html).toContain('value="ann"');
    expect(html).toContain('aria-label="Search drivers"');
    expect(html).toMatch(/<svg[^>]*lucide-search[^>]*aria-hidden="true"/);
  });
});

describe("createDebouncer (R6: a pause of 300 ms)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits the delay before it calls", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_WRITE_DELAY_MS);
    d.schedule("ann");
    vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS - 1);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("ann");
  });

  it("calls once with the last text when the user keeps typing", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_WRITE_DELAY_MS);
    d.schedule("a");
    vi.advanceTimersByTime(100);
    d.schedule("an");
    vi.advanceTimersByTime(100);
    d.schedule("ann");
    vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS);
    expect(fn.mock.calls).toEqual([["ann"]]);
  });

  it("calls again for text typed after the pause", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_WRITE_DELAY_MS);
    d.schedule("a");
    vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS);
    d.schedule("ab");
    vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS);
    expect(fn.mock.calls).toEqual([["a"], ["ab"]]);
  });

  it("cancel drops the pending call", () => {
    const fn = vi.fn();
    const d = createDebouncer(fn, SEARCH_WRITE_DELAY_MS);
    d.schedule("ann");
    d.cancel();
    vi.advanceTimersByTime(SEARCH_WRITE_DELAY_MS * 2);
    expect(fn).not.toHaveBeenCalled();
  });

  it("is 300 ms", () => {
    expect(SEARCH_WRITE_DELAY_MS).toBe(300);
  });
});
