import { describe, expect, it } from "vitest";
import {
  formatInstallmentDue,
  installmentDueLabel,
  installmentDueWords,
} from "./formatInstallmentDue";

describe("formatInstallmentDue", () => {
  it("prints the date when there is one", () => {
    expect(formatInstallmentDue("2026-11-26")).toBe("Nov 26, 2026");
  });
  it("prints On signing when the first installment has no date yet", () => {
    expect(formatInstallmentDue("")).toBe("On signing");
    expect(formatInstallmentDue(null)).toBe("On signing");
  });
});

describe("installmentDueLabel and installmentDueWords", () => {
  it("say Due plus the date, or on signing", () => {
    expect(installmentDueLabel("2026-11-26")).toBe("Due Nov 26, 2026");
    expect(installmentDueLabel("")).toBe("Due on signing");
    expect(installmentDueLabel(null)).toBe("Due on signing");
    expect(installmentDueWords("2026-11-26")).toBe("due Nov 26, 2026");
    expect(installmentDueWords(null)).toBe("due on signing");
  });
});
