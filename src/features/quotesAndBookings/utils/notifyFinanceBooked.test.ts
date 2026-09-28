import { describe, it, expect } from "vitest";
import { shouldNotifyFinanceBooked } from "./notifyFinanceBooked";

describe("shouldNotifyFinanceBooked", () => {
  it.each(["draft", "quoted", "lost", null, undefined])("fires when %s becomes booked", (old) => {
    expect(shouldNotifyFinanceBooked(old, "booked")).toBe(true);
  });

  it("does not fire when the quote was already booked", () => {
    expect(shouldNotifyFinanceBooked("booked", "booked")).toBe(false);
  });

  it.each(["draft", "quoted", "lost", null])("does not fire when the new status is %s", (next) => {
    expect(shouldNotifyFinanceBooked("quoted", next)).toBe(false);
  });
});
