/**
 * The signed-in shell wraps every page in its own `h-dvh overflow-y-auto` box and hides the
 * body's overflow (src/components/SignedInShell.tsx), so on this page `window` never scrolls: the
 * box does. Walks up from `from` to the nearest ancestor that really scrolls and puts it back at
 * the top, falling back to the window for a page that scrolls normally.
 */
export type ScrollBox = {
  parentElement: ScrollBox | null;
  scrollHeight: number;
  clientHeight: number;
  scrollTo?: (options: { top: number }) => void;
};

export function scrollToTop(
  from: ScrollBox | null,
  {
    overflowYOf = (el: ScrollBox) => getComputedStyle(el as unknown as Element).overflowY,
    win = typeof window === "undefined" ? undefined : window,
  }: {
    overflowYOf?: (el: ScrollBox) => string;
    win?: { scrollTo?: (options: { top: number }) => void };
  } = {},
): void {
  for (let el = from?.parentElement ?? null; el; el = el.parentElement) {
    const overflowY = overflowYOf(el);
    const scrolls = overflowY === "auto" || overflowY === "scroll";
    if (scrolls && el.scrollHeight > el.clientHeight && typeof el.scrollTo === "function") {
      el.scrollTo({ top: 0 });
      return;
    }
  }
  if (typeof win?.scrollTo === "function") win.scrollTo({ top: 0 });
}
