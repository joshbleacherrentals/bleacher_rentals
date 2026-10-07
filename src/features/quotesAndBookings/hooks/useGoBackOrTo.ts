"use client";
import { useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Whether "back" has anywhere in the app to go. A page opened in a new tab or from a forwarded
 * link is the only entry in its history. It is also true when the previous entry is another site,
 * in which case Back leaves the app; the fallback only covers "no history at all".
 */
export function shouldGoBack(historyLength: number): boolean {
  return historyLength > 1;
}

/**
 * The card's way out: back to wherever it was opened from (the list with its filters, or
 * /accountant with its tab and page), or to `fallback` when there is no history.
 * docs/specs/accountant-quotes-04-accountant-quote-access.md, D3 and D7.
 */
export function useGoBackOrTo(fallback = "/quotes-bookings"): () => void {
  const router = useRouter();
  return useCallback(() => {
    if (shouldGoBack(window.history.length)) router.back();
    else router.push(fallback);
  }, [router, fallback]);
}
