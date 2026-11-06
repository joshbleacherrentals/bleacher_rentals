import { describe, expect, it, vi } from "vitest";
import { startCheckout } from "./PayInvoiceTab";

// Spec: docs/specs/accountant-collections-16-customer-page-view.md §3 and §5. Stripe's checkout
// page cannot be framed, so inside the invoice page's frame it opens in a new tab; for a customer
// the page is replaced as before.

const URL = "https://checkout.stripe.test/session/abc";

describe("startCheckout", () => {
  it("replaces the page's address when the page is not embedded", () => {
    const open = vi.fn();
    const assign = vi.fn();
    expect(startCheckout({ embedded: false, url: URL, open, assign })).toBe(true);
    expect(assign).toHaveBeenCalledExactlyOnceWith(URL);
    expect(open).not.toHaveBeenCalled();
  });

  it("opens a new tab when the page is embedded, and clears the new tab's opener", () => {
    const tab = { opener: "the invoice page" as unknown };
    const open = vi.fn(() => tab);
    const assign = vi.fn();
    expect(startCheckout({ embedded: true, url: URL, open, assign })).toBe(true);
    expect(open).toHaveBeenCalledExactlyOnceWith(URL, "_blank");
    expect(tab.opener).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it("reports a blocked tab, and does not fall back to replacing the page", () => {
    const open = vi.fn(() => null);
    const assign = vi.fn();
    expect(startCheckout({ embedded: true, url: URL, open, assign })).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
