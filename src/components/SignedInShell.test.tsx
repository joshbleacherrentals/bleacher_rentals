import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-16-customer-page-view.md §3 and §5. The signed-in tree of
// the root layout, and the one case where it steps aside: the customer's page inside the invoice
// page's frame. The pieces of the tree have tests of their own; here they are markers.

const nav = vi.hoisted(() => ({ pathname: "/", query: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock("next/script", () => ({ default: () => <i data-part="maps-script" /> }));
vi.mock("sonner", () => ({ Toaster: () => <i data-part="toaster" /> }));
vi.mock("@/components/providers/TanstackProvider", () => ({
  TanstackProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-part="tanstack">{children}</div>
  ),
}));
vi.mock("@/components/providers/DynamicSystemProvider", () => ({
  DynamicSystemProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-part="powersync">{children}</div>
  ),
}));
vi.mock("./SignedInComponents", () => ({
  SignedInComponents: ({ children }: { children: React.ReactNode }) => (
    <div data-part="app-shell">{children}</div>
  ),
}));

import { SignedInShell } from "./SignedInShell";

function renderAt(pathname: string, query = "") {
  nav.pathname = pathname;
  nav.query = query;
  return renderToStaticMarkup(
    <SignedInShell>
      <main>the page</main>
    </SignedInShell>,
  );
}

const SHELL_PARTS = ["maps-script", "toaster", "tanstack", "powersync", "app-shell"];

beforeEach(() => {
  nav.pathname = "/";
  nav.query = "";
});

describe("SignedInShell", () => {
  it("wraps an ordinary page in the whole signed-in tree, as the layout did", () => {
    const html = renderAt("/accountant");
    for (const part of SHELL_PARTS) expect(html, part).toContain(`data-part="${part}"`);
    expect(html).toContain("<main>the page</main>");
    expect(html).not.toContain("h-dvh");
  });

  it("nests the page in the same order as before: providers, then the app shell", () => {
    const html = renderAt("/accountant");
    const order = ["tanstack", "powersync", "app-shell"].map((part) =>
      html.indexOf(`data-part="${part}"`),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.indexOf('data-part="app-shell"')).toBeLessThan(html.indexOf("the page"));
  });

  it("shows the customer's page bare when it is embedded: in a plain box, no providers, no app shell", () => {
    const html = renderAt("/quote/evt-1", "embed=1&tab=pay");
    expect(html).toBe('<div class="h-dvh overflow-y-auto"><main>the page</main></div>');
  });

  it("does not hold the scroll when embedded: a wheel over the frame goes on to the invoice page", () => {
    // `overscroll-contain` would stop the scroll at the frame's edge.
    const html = renderAt("/quote/evt-1", "embed=1");
    expect(html).not.toContain("overscroll");
  });

  it("keeps the ordinary customer's page inside the app for a signed-in user", () => {
    for (const query of ["", "embed=0", "tab=pay"]) {
      const html = renderAt("/quote/evt-1", query);
      expect(html, query).toContain('data-part="app-shell"');
      expect(html, query).not.toContain("h-dvh");
    }
  });

  it("does not drop the app for embed=1 on any other page", () => {
    for (const pathname of ["/accountant/invoice", "/quotes-bookings/evt-1", "/quote"]) {
      const html = renderAt(pathname, "embed=1");
      expect(html, pathname).toContain('data-part="app-shell"');
      expect(html, pathname).not.toContain("h-dvh");
    }
  });
});
