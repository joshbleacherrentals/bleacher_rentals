import { describe, it, expect } from "vitest";
import { isDeletedPayment, withoutDeleted } from "./deletedPayments";

// docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md: what a list hides when it is
// not showing deleted rows. Whether a payment counts is allocatePayments' business, not this file's.

const live = (id: string) => ({ id, deletedAt: null });
const gone = (id: string) => ({ id, deletedAt: "2026-06-10T09:00:00.000+00:00" });

describe("isDeletedPayment", () => {
  it("is false for a payment with no deletedAt", () => {
    expect(isDeletedPayment(live("a"))).toBe(false);
  });

  it("is true for a payment with a deletedAt", () => {
    expect(isDeletedPayment(gone("a"))).toBe(true);
  });

  it("treats an empty-string deletedAt as not deleted: an empty value is not a timestamp", () => {
    const row = { id: "a", deletedAt: "" };
    expect(isDeletedPayment(row)).toBe(false);
  });
});

describe("withoutDeleted", () => {
  it("drops the deleted rows", () => {
    expect(withoutDeleted([live("a"), gone("b"), live("c")]).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("keeps the order of the rest", () => {
    const rows = [live("c"), gone("x"), live("a"), live("b")];
    expect(withoutDeleted(rows).map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("keeps the identity of the rows it keeps", () => {
    const a = live("a");
    const b = live("b");
    const result = withoutDeleted([a, gone("x"), b]);
    expect(result[0]).toBe(a);
    expect(result[1]).toBe(b);
  });

  it("returns an empty list for an empty list and for a list of only deleted rows", () => {
    expect(withoutDeleted([])).toEqual([]);
    expect(withoutDeleted([gone("a"), gone("b")])).toEqual([]);
  });

  it("does not mutate the list it is given", () => {
    const rows = [live("a"), gone("b")];
    const copy = [...rows];
    withoutDeleted(rows);
    expect(rows).toEqual(copy);
  });

  it("keeps the extra fields of the rows (it is generic over the row type)", () => {
    const rows = [{ id: "a", deletedAt: null, amountCents: 5 }];
    expect(withoutDeleted(rows)[0].amountCents).toBe(5);
  });
});
