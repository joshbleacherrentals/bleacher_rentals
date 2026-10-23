import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/qbo-invoice-07-card-buttons.md §4 (useInvoiceState) and §8. The hook is rendered
// on the server with `useTypedQuery` replaced: what it decides is what the row and the remembered
// answer mean, not how PowerSync delivers the row.

const mocks = vi.hoisted(() => ({
  answer: { data: [], isLoading: false } as { data: unknown[]; isLoading: boolean },
  compiled: undefined as { sql: string; parameters: unknown[] } | undefined,
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
  useTypedQuery: (compiled: { sql: string; parameters: unknown[] }) => {
    mocks.compiled = compiled;
    return mocks.answer;
  },
}));

import { deriveInvoiceState, useInvoiceState } from "./useInvoiceState";

function Probe({ eventId }: { eventId: string }) {
  const { hasInvoice, canCreate } = useInvoiceState(eventId);
  return <p>{JSON.stringify({ hasInvoice, canCreate })}</p>;
}

const stateOf = (row: object | null) => {
  mocks.answer = { data: row ? [row] : [], isLoading: false };
  const html = renderToStaticMarkup(<Probe eventId="evt-1" />);
  return JSON.parse(html.replace(/<\/?p>/g, "").replaceAll("&quot;", '"'));
};

describe("deriveInvoiceState", () => {
  it("canCreate: a booked quote with no invoice", () => {
    expect(
      deriveInvoiceState({ status: "booked", invoiceId: null, rememberedNumber: null }),
    ).toEqual({
      hasInvoice: false,
      canCreate: true,
    });
  });

  it.each([null, "quoted", "draft", "lost", "unsigned_changes"])(
    "S2: a quote whose status is %s and that has no invoice cannot be created",
    (status) => {
      expect(deriveInvoiceState({ status, invoiceId: null, rememberedNumber: null })).toEqual({
        hasInvoice: false,
        canCreate: false,
      });
    },
  );

  it.each(["booked", "quoted", "draft", "lost", "unsigned_changes", null])(
    "S7: hasInvoice comes from the local row, whatever the status (%s)",
    (status) => {
      expect(deriveInvoiceState({ status, invoiceId: "inv-1", rememberedNumber: null })).toEqual({
        hasInvoice: true,
        canCreate: false,
      });
    },
  );

  it("an empty link is no invoice", () => {
    expect(deriveInvoiceState({ status: "booked", invoiceId: "", rememberedNumber: null })).toEqual(
      {
        hasInvoice: false,
        canCreate: true,
      },
    );
  });

  it("S1: a remembered answer flips the button before sync does: Create becomes Update at once", () => {
    expect(
      deriveInvoiceState({ status: "booked", invoiceId: null, rememberedNumber: "900000001" }),
    ).toEqual({ hasInvoice: true, canCreate: false });
  });

  it("a remembered answer on a quote that is not booked still means an invoice exists", () => {
    expect(
      deriveInvoiceState({ status: "lost", invoiceId: null, rememberedNumber: "900000001" }),
    ).toEqual({ hasInvoice: true, canCreate: false });
  });

  it("the synced link and the remembered answer together are one invoice", () => {
    expect(
      deriveInvoiceState({ status: "booked", invoiceId: "inv-1", rememberedNumber: "900000001" }),
    ).toEqual({ hasInvoice: true, canCreate: false });
  });
});

describe("useInvoiceState", () => {
  beforeEach(() => {
    mocks.answer = { data: [], isLoading: false };
    mocks.compiled = undefined;
  });

  it("reads the event's status and invoice link reactively, by the event's id", () => {
    stateOf({ event_status: "booked", qbo_invoice_id: null });

    expect(mocks.compiled?.sql).toContain('"Events"');
    expect(mocks.compiled?.sql).toContain("event_status");
    expect(mocks.compiled?.sql).toContain("qbo_invoice_id");
    expect(mocks.compiled?.parameters).toContain("evt-1");
  });

  it("a booked event with no link: Create is offered", () => {
    expect(stateOf({ event_status: "booked", qbo_invoice_id: null })).toEqual({
      hasInvoice: false,
      canCreate: true,
    });
  });

  it("an event with a link: Update, whatever the status", () => {
    expect(stateOf({ event_status: "lost", qbo_invoice_id: "inv-1" })).toEqual({
      hasInvoice: true,
      canCreate: false,
    });
  });

  it("an event that has not reached the local database yet: nothing is offered", () => {
    expect(stateOf(null)).toEqual({ hasInvoice: false, canCreate: false });
  });
});
