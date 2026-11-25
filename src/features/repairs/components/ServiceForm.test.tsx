import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyServiceForm, type ServiceFormValues } from "../utils/serviceForm";
import {
  ServiceFormFields,
  firstServiceErrorFieldId,
  type ServiceFormFieldsProps,
} from "./ServiceForm";

// docs/specs/repairs-09b1-services.md §2.2 and §7 (D151 to D155). The fields are rendered on the
// server (the selects open in portals, which Vitest's node environment does not have); what is under
// test is which labels, values, signs and error texts each part gets.

const values: ServiceFormValues = {
  bleacherUuid: "b1",
  categoryUuid: "c1",
  severity: "major",
  description: "Needed spindles rewelded",
  laborText: "1,260.00",
  partsText: "348.60",
  taxText: "34.55",
  freightText: "0.00",
};

const render = (over: Partial<ServiceFormFieldsProps> = {}) =>
  renderToStaticMarkup(
    <ServiceFormFields
      mode="edit"
      values={values}
      errors={{}}
      bleachers={[
        { value: "b1", label: "#26" },
        { value: "b2", label: "#27" },
      ]}
      categories={[
        { value: "c1", label: "Welding" },
        { value: "c2", label: "Tires" },
      ]}
      currency="USD"
      reportedDay="2026-09-17"
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

describe("ServiceFormFields labels and values (the canvas ServiceModalEdit)", () => {
  it("labels every field of the window", () => {
    const words = text(render());
    for (const label of [
      "Bleacher",
      "Category",
      "Severity",
      "Description",
      "Labor",
      "Parts",
      "Tax",
      "Freight",
      "Total",
    ]) {
      expect(words, label).toContain(label);
    }
  });

  it("puts the values into the inputs and shows the chosen bleacher, category and severity", () => {
    const markup = render();
    expect(markup).toMatch(
      /<textarea[^>]*id="service-description"[^>]*>Needed spindles rewelded<\/textarea>/,
    );
    expect(markup).toMatch(/<input[^>]*value="1,260.00"/);
    expect(markup).toMatch(/<input[^>]*value="348.60"/);
    const words = text(markup);
    expect(words).toContain("#26");
    expect(words).toContain("Welding");
    expect(words).toContain("Major");
  });

  it("the Total is the live sum of the four amounts", () => {
    expect(text(render())).toContain("$1,643.15");
    expect(text(render({ values: { ...values, laborText: "" } }))).toContain("$383.15");
  });

  it("an empty form shows the placeholders of the canvas and a $0.00 total", () => {
    const markup = render({ mode: "new", values: emptyServiceForm(), reportedDay: null });
    const words = text(markup);
    expect(words).toContain("Select a bleacher");
    expect(words).toContain("Select a category");
    expect(words).toContain("Select severity");
    expect(words).toContain("$0.00");
    expect(markup).toContain('placeholder="What is wrong, or what was done"');
    expect(markup).toContain('placeholder="0.00"');
  });

  it("the money inputs carry the sign of the repair's currency", () => {
    expect(text(render({ currency: "USD" }))).toContain("$1,643.15");
    const cad = text(render({ currency: "CAD" }));
    expect(cad).toContain("C$1,643.15");
    expect(cad).toMatch(/C\$ *Labor|Labor.*C\$/);
  });
});

describe("the Reported line (the canvas)", () => {
  it("is drawn in Edit with a day and says it is not edited here", () => {
    const words = text(render({ reportedDay: "2026-09-17" }));
    expect(words).toContain("Reported");
    expect(words).toContain("2026-09-17");
    expect(words).toContain("found from the driver's damage report, not edited here");
  });

  it("is not drawn without a day, nor in Add", () => {
    expect(text(render({ reportedDay: null }))).not.toContain("not edited here");
    expect(text(render({ mode: "new", reportedDay: "2026-09-17" }))).not.toContain(
      "not edited here",
    );
  });
});

describe("the error texts (D151, D155)", () => {
  it("sit under Bleacher and Severity and nowhere else", () => {
    const markup = render({
      errors: { bleacherUuid: "Bleacher is required.", severity: "Severity is required." },
    });
    expect(markup).toMatch(/data-testid="service-error-bleacher"[^>]*>Bleacher is required\./);
    expect(markup).toMatch(/data-testid="service-error-severity"[^>]*>Severity is required\./);
    expect((markup.match(/role="alert"/g) ?? []).length).toBe(2);
    expect(text(render())).not.toContain("is required");
  });

  it("firstServiceErrorFieldId names the first field with an error in the order drawn", () => {
    expect(firstServiceErrorFieldId({})).toBeNull();
    expect(firstServiceErrorFieldId({ severity: "x" })).toBe("service-severity");
    expect(firstServiceErrorFieldId({ bleacherUuid: "x", severity: "y" })).toBe("service-bleacher");
  });
});

describe("while Save runs", () => {
  it("every input is disabled", () => {
    const markup = render({ disabled: true });
    const inputs = markup.match(/<(input|textarea)\b[^>]*>/g) ?? [];
    expect(inputs.length).toBeGreaterThanOrEqual(5);
    for (const input of inputs) expect(input).toContain("disabled");
  });
});
