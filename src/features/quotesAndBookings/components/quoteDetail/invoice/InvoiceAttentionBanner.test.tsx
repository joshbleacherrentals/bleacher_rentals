import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/qbo-invoice-09-banner.md §4 (the banner), §6 (S1–S4, S8) and §8. The component is
// rendered on the server with `useTypedQuery` replaced: what it decides is what the local row says,
// and that a new row (the local database changed) gives a new banner. How PowerSync delivers the row
// is not under test.

const mocks = vi.hoisted(() => ({
  answer: { data: [], isLoading: false } as { data: unknown[]; isLoading: boolean },
}));

vi.mock("@/components/providers/SystemProvider", async () => {
  const { DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } =
    await import("kysely");
  return {
    db: new Kysely({
      dialect: {
        createAdapter: () => new SqliteAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new SqliteIntrospector(kysely),
        createQueryCompiler: () => new SqliteQueryCompiler(),
      },
    }),
  };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  useTypedQuery: () => mocks.answer,
}));

import { InvoiceAttentionBanner, InvoiceAttentionBannerView } from "./InvoiceAttentionBanner";

const HEADING = "The QuickBooks invoice does not match this quote.";
const CLOSING =
  "Press Update invoice on the Billing tab, or correct the invoice in QuickBooks and press Check again.";
const DATES = "The invoice date or the due date in QuickBooks does not match this quote.";
const TOTALS = "QuickBooks&#x27; total or tax does not match this quote&#x27;s.";

const row = (over: Record<string, unknown> = {}) => ({
  qbo_invoice_id: "inv-1",
  qbo_invoice_mismatch: 1,
  qbo_invoice_mismatch_reasons: '["dates"]',
  ...over,
});

/** What the banner draws for the local row at this moment. */
const drawn = (localRow: object | null) => {
  mocks.answer = { data: localRow ? [localRow] : [], isLoading: false };
  return renderToStaticMarkup(<InvoiceAttentionBanner eventId="evt-1" />);
};

describe("InvoiceAttentionBannerView", () => {
  it("draws the heading, one line per reason in the order given, and the closing line", () => {
    const html = renderToStaticMarkup(<InvoiceAttentionBannerView reasons={["dates", "totals"]} />);

    expect(html).toContain(HEADING);
    expect(html).toContain(DATES);
    expect(html).toContain(TOTALS);
    expect(html).toContain(CLOSING);
    expect(html.indexOf(HEADING)).toBeLessThan(html.indexOf(DATES));
    expect(html.indexOf(DATES)).toBeLessThan(html.indexOf(TOTALS));
    expect(html.indexOf(TOTALS)).toBeLessThan(html.indexOf(CLOSING));
    expect(html.match(/<li/g)).toHaveLength(2);
  });

  it("draws nothing when there are no reasons", () => {
    expect(renderToStaticMarkup(<InvoiceAttentionBannerView reasons={[]} />)).toBe("");
  });

  it("is drawn in red, like the attention marks of /work-trackers", () => {
    const html = renderToStaticMarkup(<InvoiceAttentionBannerView reasons={["dates"]} />);

    expect(html).toMatch(/class="[^"]*\b(?:bg|border|text)-red-\d+/);
  });
});

describe("InvoiceAttentionBanner", () => {
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false };
  });

  it("S1: a quote whose flag is false: no banner", () => {
    expect(drawn(row({ qbo_invoice_mismatch: 0, qbo_invoice_mismatch_reasons: null }))).toBe("");
  });

  it("S2: the flag set with the reasons [dates]: the heading, the dates line and the closing line", () => {
    const html = drawn(row());

    expect(html).toContain(HEADING);
    expect(html).toContain(DATES);
    expect(html).toContain(CLOSING);
    expect(html.match(/<li/g)).toHaveLength(1);
  });

  it("S3: the reasons [dates, totals]: both lines, in that order", () => {
    const html = drawn(row({ qbo_invoice_mismatch_reasons: '["dates","totals"]' }));

    expect(html).toContain(DATES);
    expect(html).toContain(TOTALS);
    expect(html.indexOf(DATES)).toBeLessThan(html.indexOf(TOTALS));
  });

  it("S4: the flag set and no reasons: the generic line", () => {
    const html = drawn(row({ qbo_invoice_mismatch_reasons: null }));

    expect(html).toContain(HEADING);
    expect(html.match(/<li/g)).toHaveLength(1);
    expect(html).toContain(CLOSING);
  });

  it("S6: a set flag on a quote with no invoice: no banner", () => {
    expect(drawn(row({ qbo_invoice_id: null }))).toBe("");
  });

  it("draws nothing while the event is not in the local database yet", () => {
    expect(drawn(null)).toBe("");
  });

  it("S8: it follows a change of the local row, with no reload: the banner goes when the flag clears", () => {
    expect(drawn(row())).toContain(DATES);

    // Update invoice runs, the check finds an equal invoice, the server clears the flag, sync brings it down.
    const cleared = drawn(row({ qbo_invoice_mismatch: 0, qbo_invoice_mismatch_reasons: null }));
    expect(cleared).toBe("");
  });

  it("follows a change of the reasons too", () => {
    expect(drawn(row())).not.toContain(TOTALS);

    const more = drawn(row({ qbo_invoice_mismatch_reasons: '["dates","totals"]' }));
    expect(more).toContain(DATES);
    expect(more).toContain(TOTALS);
  });
});
