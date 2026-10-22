import { describe, expect, it } from "vitest";
import { buildInvoicePayload } from "./buildInvoicePayload";
import type { InvoiceRefs, InvoiceSource } from "./invoiceTypes";

/**
 * R1/R2 of the spec: the invoice hash (spec 01, recompute_quote_hashes) says "outdated" only for
 * what it lists. Every InvoiceSource field the builder reads is mapped here to the member of that
 * hash document it is covered by. Reading a field that is not on this list fails the test: add the
 * member to the hash first (a migration), then to the list.
 */
const HASH_MEMBER_OF_FIELD: Record<string, string> = {
  invoiceNumber: "invoiceNumber",
  eventStart: "invoiceDate",
  dueDate: "dueDate",
  title: "title",
  billToName: "customer",
  amountCents: "amountCents",
  taxCents: "taxAmountCents",
  "venue.street": "venue",
  "venue.city": "venue",
  "venue.state": "venue",
  "venue.zip": "venue",
  canadianProvince: "venue",
};

const source: InvoiceSource = {
  eventId: "event-1",
  eventStatus: "booked",
  deleted: false,
  invoiceNumber: 100200300,
  title: "SC - CLEMSON - RALLY",
  eventTypeName: "Corporate",
  eventStart: "2026-11-14",
  dueDate: "2026-11-01",
  venue: { street: "1 Yonge St", city: "Toronto", state: "ON", zip: "M5E 1E5" },
  billedContact: {
    id: "contact-1",
    firstName: "Dabo",
    lastName: "Swinney",
    email: "d@example.com",
    companyName: "Clemson Athletics",
  },
  billToName: "Dabo Swinney",
  amountCents: 750000,
  taxCents: 97500,
  currency: "CAD",
  canadianProvince: "ON",
  salesOfficeId: "office-1",
  connectionId: "conn-1",
  qboInvoiceId: null,
  qboInvoiceConnectionId: null,
  qboInvoiceHash: "hash",
  qboInvoiceSentHash: null,
  qboInvoiceMismatch: false,
};

const refs: InvoiceRefs = {
  item: { id: "77", name: "Bleacher Rental - Corporate", description: "Seats" },
  customerId: "900",
  classId: "5",
  canadianTaxCodeId: "12",
};

/** Wraps the source so every property read is recorded as a dotted path. */
function recording(value: object, reads: Set<string>, prefix = ""): any {
  return new Proxy(value, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver);
      if (typeof key !== "string") return v;
      const path = prefix + key;
      if (v && typeof v === "object") return recording(v, reads, `${path}.`);
      reads.add(path);
      return v;
    },
  });
}

/** One edit per listed field that must change the body. */
const EDIT: Record<string, (s: InvoiceSource) => InvoiceSource> = {
  invoiceNumber: (s) => ({ ...s, invoiceNumber: 1 }),
  eventStart: (s) => ({ ...s, eventStart: "2026-12-01" }),
  dueDate: (s) => ({ ...s, dueDate: "2026-12-02" }),
  title: (s) => ({ ...s, title: "other" }),
  billToName: (s) => ({ ...s, billToName: "Someone Else" }),
  amountCents: (s) => ({ ...s, amountCents: 1 }),
  taxCents: (s) => ({ ...s, taxCents: 0 }),
  "venue.street": (s) => ({ ...s, venue: { ...s.venue, street: "2 King St" } }),
  "venue.city": (s) => ({ ...s, venue: { ...s.venue, city: "Ottawa" } }),
  "venue.state": (s) => ({ ...s, venue: { ...s.venue, state: "QC" } }),
  "venue.zip": (s) => ({ ...s, venue: { ...s.venue, zip: "K1A 0A9" } }),
  canadianProvince: (s) => ({ ...s, canadianProvince: null }),
};

describe("invoice hash parity", () => {
  it("the builder reads only fields that the hash covers", () => {
    const reads = new Set<string>();
    buildInvoicePayload(recording(source, reads), refs);
    expect(reads.size).toBeGreaterThan(0);
    const unlisted = [...reads].filter((path) => !(path in HASH_MEMBER_OF_FIELD));
    expect(unlisted).toEqual([]);
  });

  it("every listed field is actually read, and changing it changes the body", () => {
    const reads = new Set<string>();
    buildInvoicePayload(recording(source, reads), refs);
    const base = JSON.stringify(buildInvoicePayload(source, refs).body);
    for (const path of Object.keys(HASH_MEMBER_OF_FIELD)) {
      expect(reads.has(path), `${path} is listed but never read`).toBe(true);
      expect(EDIT[path], `no edit for ${path}`).toBeDefined();
      const edited = JSON.stringify(buildInvoicePayload(EDIT[path](source), refs).body);
      expect(edited, `changing ${path} did not change the body`).not.toBe(base);
    }
  });

  it("fields the hash does not cover do not change the body", () => {
    const base = JSON.stringify(buildInvoicePayload(source, refs).body);
    const other: InvoiceSource = {
      ...source,
      eventStatus: "lost",
      qboInvoiceHash: "x",
      qboInvoiceSentHash: "y",
      qboInvoiceMismatch: true,
      connectionId: "conn-2",
      currency: "USD",
    };
    expect(JSON.stringify(buildInvoicePayload(other, refs).body)).toBe(base);
  });
});
