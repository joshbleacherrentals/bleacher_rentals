import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/dashboard-events-read-only.md §3.3 and §7. Every field of the Details tab is on
// screen and cannot be changed; the Booked At default that existed so Update could save it is
// gone, so a booked event with no stored date shows an empty field (reading R4).

const mocks = vi.hoisted(() => ({ event: {} as Record<string, unknown> }));

vi.mock("../../state/useCurrentEventStore", () => ({
  useCurrentEventStore: Object.assign(
    (select: (s: Record<string, unknown>) => unknown) => select(mocks.event),
    { getState: () => mocks.event },
  ),
}));
vi.mock("@/features/pricingMatrix/hooks/useBleacherTypesActive", () => ({
  useBleacherTypesActive: () => ({ bleacherTypes: [] }),
}));
vi.mock("../../hooks/useBleacherMismatch", () => ({
  useBleacherMismatch: () => ({ assignedCountByType: {} }),
}));

import { DetailsTab } from "./DetailsTab";

const event = (over: Record<string, unknown> = {}) => ({
  selectedStatus: "quoted",
  lostReason: null,
  lostReasonNote: "",
  notes: "Gate B for the truck",
  bookedAt: null,
  createdAt: "2026-08-01T14:30:00Z",
  bleacherRequirements: [],
  setField: vi.fn(),
  ...over,
});

const tags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
const isDisabled = (openTag: string) => /\sdisabled(=|\s|>)/.test(openTag);

beforeEach(() => {
  mocks.event = event();
});

describe("DetailsTab", () => {
  it.each([
    ["quoted", {}],
    ["booked", { selectedStatus: "booked", bookedAt: "2026-09-01T12:00:00Z" }],
    [
      "lost for another reason",
      { selectedStatus: "lost", lostReason: "other", lostReasonNote: "x" },
    ],
  ])("locks every field of a %s event", (_name, over) => {
    mocks.event = event(over);
    const html = renderToStaticMarkup(<DetailsTab />);

    const fields = [...tags(html, "input"), ...tags(html, "textarea"), ...tags(html, "button")];
    expect(fields.length).toBeGreaterThanOrEqual(3);
    for (const field of fields) expect(isDisabled(field), field).toBe(true);
  });

  it("still shows the stored values", () => {
    const html = renderToStaticMarkup(<DetailsTab />);

    expect(html).toContain("Gate B for the truck");
    expect(html).toContain("2026-08-01T14:30");
    expect(html).toContain("Quoted");
  });

  it("shows an empty Booked At for a booked event that has no stored date", () => {
    mocks.event = event({ selectedStatus: "booked", bookedAt: null });
    const html = renderToStaticMarkup(<DetailsTab />);

    expect(html).toContain("Booked At");
    // Only the Created At input carries a value; the Booked At input is empty.
    const dateInputs = tags(html, "input").filter((i) => i.includes('type="date"'));
    expect(dateInputs).toHaveLength(1);
    expect(dateInputs[0]).toContain('value=""');
  });
});
