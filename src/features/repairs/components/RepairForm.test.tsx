import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { RepairFormErrors, RepairFormValues } from "../utils/repairForm";
import { RepairFormFields, type RepairFormFieldsProps } from "./RepairForm";

// docs/specs/repairs-09a-repair-writes.md §2.3 and §7 (D128 to D138). The fields are rendered on
// the server (the selects open in portals, which Vitest's node environment does not have); what is
// under test is which labels, values, read-only texts and error texts each part gets.

const values: RepairFormValues = {
  vendorUuid: "v1",
  invoiceNumber: "JJ-5",
  status: "in_repair",
  currency: "CAD",
  eventStart: "2026-11-01",
  eventEnd: "2026-11-05",
  notes: "Welded the spindle",
};

const render = (over: Partial<RepairFormFieldsProps> = {}) =>
  renderToStaticMarkup(
    <RepairFormFields
      mode="edit"
      values={values}
      errors={{}}
      vendors={[
        { value: "v1", label: "Dallas Trailer Repair" },
        { value: "v2", label: "Caprock Tire" },
      ]}
      zones={[{ uuid: "z3", name: "Zone 3" }]}
      completedOn="2026-11-05"
      disabled={false}
      onChange={() => {}}
      {...over}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

describe("RepairFormFields labels and values (D128)", () => {
  it("labels every field of the window", () => {
    const words = text(render());
    for (const label of [
      "Vendor",
      "Invoice #",
      "Status",
      "Currency",
      "Repair from",
      "Repair to",
      "Zone",
      "Completed",
      "Notes",
    ]) {
      expect(words, label).toContain(label);
    }
  });

  it("puts the values into the inputs", () => {
    const markup = render();
    expect(markup).toMatch(/<input[^>]*id="repair-invoice"[^>]*value="JJ-5"/);
    expect(markup).toMatch(/<input[^>]*id="repair-from"[^>]*value="2026-11-01"/);
    expect(markup).toMatch(/<input[^>]*id="repair-to"[^>]*value="2026-11-05"/);
    expect(markup).toMatch(/<textarea[^>]*id="repair-notes"[^>]*>Welded the spindle<\/textarea>/);
  });

  it("shows the chosen vendor, status and currency by their words", () => {
    const words = text(render());
    expect(words).toContain("Dallas Trailer Repair");
    expect(words).toContain("In repair");
    expect(words).toContain("CAD");
  });

  it("draws the two days as date inputs (D136)", () => {
    const markup = render();
    expect(markup).toMatch(
      /<input[^>]*id="repair-from"[^>]*type="date"|<input[^>]*type="date"[^>]*id="repair-from"/,
    );
    expect(markup).toMatch(
      /<input[^>]*id="repair-to"[^>]*type="date"|<input[^>]*type="date"[^>]*id="repair-to"/,
    );
  });

  it("asks the placeholder of the canvas for the invoice number and the notes", () => {
    const markup = render({ values: { ...values, invoiceNumber: "", notes: "" } });
    expect(markup).toContain('placeholder="e.g. DTR-2377"');
    expect(markup).toContain('placeholder="Notes about the repair"');
  });
});

describe("RepairFormFields read-only fields (D18)", () => {
  it("draws Zone and Completed as text, not inputs", () => {
    const markup = render();
    // Only the invoice number and the two days are inputs.
    expect(markup.match(/<input/g) ?? []).toHaveLength(3);
    expect(markup.match(/<textarea/g) ?? []).toHaveLength(1);
    expect(text(markup)).toContain("Zone 3");
    expect(text(markup)).toContain("2026-11-05");
  });

  it("puts each zone on its own line, and a dash for none", () => {
    const two = render({
      zones: [
        { uuid: "z1", name: "Zone 1" },
        { uuid: "z2", name: "Zone 2" },
      ],
    });
    expect(two).toMatch(/<div[^>]*>Zone 1<\/div>/);
    expect(two).toMatch(/<div[^>]*>Zone 2<\/div>/);
    expect(text(render({ zones: [], completedOn: null }))).toContain("Zone —");
  });

  it("shows a dash for Completed while the repair is open", () => {
    expect(text(render({ completedOn: null }))).toMatch(/Completed —/);
  });

  it("says in New repair that the zone is set from the bleachers, and tells about the currency (D128)", () => {
    const words = text(
      render({
        mode: "new",
        zones: [],
        completedOn: null,
        values: { ...values, vendorUuid: null },
      }),
    );
    expect(words).toContain("Set from the bleachers");
    expect(words).toContain("The currency is filled from the vendor's country");
  });

  it("does not say that line in Edit", () => {
    expect(text(render())).not.toContain("The currency is filled from the vendor's country");
  });
});

describe("RepairFormFields errors (D138)", () => {
  const errors: RepairFormErrors = {
    eventStart: "Repair from is required.",
    eventEnd: "Repair to must not be before Repair from.",
    invoiceNumber: "This vendor already has a repair with this invoice number.",
  };

  it("draws no error text without errors", () => {
    const markup = render();
    expect(markup).not.toContain("repair-error-");
    expect(markup).not.toContain('role="alert"');
  });

  it("draws each error under its own field", () => {
    const markup = render({ errors });
    for (const [key, id, message] of [
      ["invoice", "repair-invoice", errors.invoiceNumber],
      ["from", "repair-from", errors.eventStart],
      ["to", "repair-to", errors.eventEnd],
    ] as const) {
      const at = markup.indexOf(`data-testid="repair-error-${key}"`);
      expect(at, key).toBeGreaterThan(markup.indexOf(`id="${id}"`));
      expect(text(markup.slice(at, at + 200))).toContain(message);
    }
  });

  it("draws an error only for the field that has one", () => {
    const markup = render({ errors: { eventEnd: errors.eventEnd } });
    expect(markup).toContain('data-testid="repair-error-to"');
    expect(markup).not.toContain('data-testid="repair-error-from"');
    expect(markup).not.toContain('data-testid="repair-error-invoice"');
  });
});

describe("RepairFormFields while Save runs", () => {
  it("disables every input and the notes", () => {
    const markup = render({ disabled: true });
    expect(markup.match(/<input[^>]*disabled=""/g) ?? []).toHaveLength(3);
    expect(markup).toMatch(/<textarea[^>]*disabled=""/);
  });

  it("leaves them enabled otherwise", () => {
    const markup = render();
    expect(markup).not.toMatch(/<input[^>]*disabled=""/);
    expect(markup).not.toMatch(/<textarea[^>]*disabled=""/);
  });
});
