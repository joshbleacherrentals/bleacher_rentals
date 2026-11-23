import { describe, expect, it } from "vitest";
import { determineQuoteCta } from "./quoteCta";

const unpaid = { status: "unpaid" as const };
const partial = { status: "partial" as const };
const paid = { status: "paid" as const };

function cta(overrides: Partial<Parameters<typeof determineQuoteCta>[0]> = {}) {
  return determineQuoteCta({
    signed: false,
    hasContract: true,
    paymentSchedule: [unpaid],
    totalCents: 100_000,
    ...overrides,
  });
}

describe("determineQuoteCta", () => {
  it("asks an unsigned quote to be approved", () => {
    expect(cta()).toBe("approve");
  });

  it("asks for payment once signed, while any installment is still owed", () => {
    expect(cta({ signed: true })).toBe("pay");
    expect(cta({ signed: true, paymentSchedule: [paid, partial] })).toBe("pay");
    expect(cta({ signed: true, paymentSchedule: [paid, unpaid] })).toBe("pay");
  });

  it("shows paid in full, not a button, when every installment is paid", () => {
    expect(cta({ signed: true, paymentSchedule: [paid, paid] })).toBe("paid");
  });

  it("asks for payment when signed with no schedule (the pay tab works out the balance)", () => {
    expect(cta({ signed: true, paymentSchedule: [] })).toBe("pay");
  });

  it("has nothing to ask for on an unsigned quote with no contract to sign", () => {
    expect(cta({ hasContract: false })).toBeNull();
  });

  it("still asks for payment on a signed quote even if the template was later removed", () => {
    expect(cta({ signed: true, hasContract: false })).toBe("pay");
  });

  it("has nothing to pay when the total is zero", () => {
    expect(cta({ signed: true, totalCents: 0, paymentSchedule: [] })).toBeNull();
  });

  it("does not show paid in full for a paid schedule with no signature", () => {
    expect(cta({ signed: false, paymentSchedule: [paid] })).toBe("approve");
  });
});
