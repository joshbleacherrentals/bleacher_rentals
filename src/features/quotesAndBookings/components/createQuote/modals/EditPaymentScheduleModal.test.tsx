import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InstallmentDateCell, canRemoveInstallment } from "./EditPaymentScheduleModal";

const base = { id: "a", percentageBps: 5000, pctDisplay: "50" };

describe("InstallmentDateCell", () => {
  it("shows On signing, with no date input, for the first installment before it is booked", () => {
    const html = renderToStaticMarkup(
      <InstallmentDateCell
        index={0}
        installment={{ ...base, dueDate: "", dueOnSigning: true }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("On signing");
    expect(html).not.toContain("<input");
  });

  it("shows the day the database wrote, read-only, with its note", () => {
    const html = renderToStaticMarkup(
      <InstallmentDateCell
        index={0}
        installment={{ ...base, dueDate: "2026-11-26", dueOnSigning: true }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain("Nov 26, 2026");
    expect(html).toContain("Set when the quote was first booked");
    expect(html).not.toContain("<input");
  });

  it("keeps a date input for every other row", () => {
    const html = renderToStaticMarkup(
      <InstallmentDateCell
        index={1}
        installment={{ ...base, id: "b", dueDate: "2026-12-01", dueOnSigning: false }}
        onChange={() => {}}
      />,
    );
    expect(html).toContain('type="date"');
    expect(html).toContain('aria-label="Installment 2 due date"');
    expect(html).toContain('value="2026-12-01"');
  });
});

describe("canRemoveInstallment", () => {
  const rows = [
    { ...base, id: "a", dueDate: "", dueOnSigning: true },
    { ...base, id: "b", dueDate: "2026-12-01", dueOnSigning: false },
    { ...base, id: "c", dueDate: "2026-12-10", dueOnSigning: false },
  ];
  it("never lets the first (marked) row go", () => {
    expect(canRemoveInstallment(rows, rows[0])).toBe(false);
  });
  it("lets the other rows go while there are two or more", () => {
    expect(canRemoveInstallment(rows, rows[1])).toBe(true);
    expect(canRemoveInstallment(rows, rows[2])).toBe(true);
  });
  it("keeps the last remaining row", () => {
    expect(canRemoveInstallment([rows[0]], rows[0])).toBe(false);
    expect(canRemoveInstallment([{ ...rows[1] }], rows[1])).toBe(false);
  });
});
