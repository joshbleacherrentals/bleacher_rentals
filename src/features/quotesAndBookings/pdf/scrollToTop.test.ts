import { describe, expect, it, vi } from "vitest";
import { scrollToTop, type ScrollBox } from "./scrollToTop";

function box(
  overflowY: string,
  { scrollHeight = 1000, clientHeight = 500 } = {},
  parent: ScrollBox | null = null,
) {
  const scrollTo = vi.fn();
  const el: ScrollBox & { overflowY: string } = {
    overflowY,
    parentElement: parent,
    scrollHeight,
    clientHeight,
    scrollTo,
  };
  return { el, scrollTo };
}
const overflowYOf = (el: ScrollBox) => (el as ScrollBox & { overflowY: string }).overflowY;

describe("scrollToTop", () => {
  it("scrolls the nearest ancestor that scrolls, not the window (the signed-in shell's box)", () => {
    const win = { scrollTo: vi.fn() };
    const shell = box("auto");
    const inner = box("visible", {}, shell.el);
    const page = box("visible", {}, inner.el);

    scrollToTop(page.el, { overflowYOf, win });

    expect(shell.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0 });
    expect(inner.scrollTo).not.toHaveBeenCalled();
    expect(win.scrollTo).not.toHaveBeenCalled();
  });

  it("skips an auto box with nothing to scroll", () => {
    const win = { scrollTo: vi.fn() };
    const outer = box("auto");
    const flat = box("auto", { scrollHeight: 500, clientHeight: 500 }, outer.el);
    const page = box("visible", {}, flat.el);

    scrollToTop(page.el, { overflowYOf, win });

    expect(flat.scrollTo).not.toHaveBeenCalled();
    expect(outer.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0 });
  });

  it("falls back to the window when no ancestor scrolls", () => {
    const win = { scrollTo: vi.fn() };
    const page = box("visible", {}, box("hidden").el);

    scrollToTop(page.el, { overflowYOf, win });

    expect(win.scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0 });
  });

  it("does not throw with no element or no window", () => {
    expect(() => scrollToTop(null, { win: undefined })).not.toThrow();
  });
});
