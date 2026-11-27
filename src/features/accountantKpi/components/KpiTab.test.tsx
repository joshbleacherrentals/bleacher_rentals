import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectedPayment } from "../utils/collectionDays";

// docs/specs/accountant-kpi.md §2.4 and §5: the range row, two cards, and the four states.

let range: { from: string | null; to: string | null } = { from: "2026-11-01", to: "2026-11-30" };
let isInverted = false;
const setRange = vi.fn();
let data: { rows: CollectedPayment[] | undefined; isLoading: boolean; error: Error | undefined };
const cards: any[] = [];

vi.mock("../hooks/useKpiRange", () => ({
  useKpiRange: () => ({ range, setRange, isInverted }),
}));
vi.mock("../hooks/useKpiData", () => ({ useKpiData: () => data }));
vi.mock("./KpiCard", () => ({
  KpiCard: (p: any) => {
    cards.push(p);
    return <div data-testid={p.testId}>{`${p.title}|${p.value}|${p.detail ?? ""}`}</div>;
  },
}));

import { DEPOSIT_HINT, FINAL_HINT, KpiTab } from "./KpiTab";

function row(
  days: number,
  collectedDay: string,
  role: "deposit" | "final",
  id: string,
): CollectedPayment {
  return { eventId: "E", paymentId: id, role, dueDate: "2026-11-01", collectedDay, days };
}

const card = (testId: string) => cards.find((c) => c.testId === testId);

beforeEach(() => {
  cards.length = 0;
  setRange.mockReset();
  range = { from: "2026-11-01", to: "2026-11-30" };
  isInverted = false;
  data = { rows: [], isLoading: false, error: undefined };
});

describe("the layout", () => {
  it("is the tab, the range controls, and the two cards in this order", () => {
    const html = renderToStaticMarkup(<KpiTab />);
    expect(html).toContain('data-testid="kpi-tab"');
    const controls = html.indexOf('data-testid="audit-range-controls"');
    const deposit = html.indexOf('data-testid="kpi-card-deposit"');
    const final = html.indexOf('data-testid="kpi-card-final"');
    expect(controls).toBeGreaterThan(-1);
    expect(deposit).toBeGreaterThan(controls);
    expect(final).toBeGreaterThan(deposit);
  });

  it("gives the cards their titles and hints", () => {
    renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-deposit").title).toBe("Days to collect Deposit");
    expect(card("kpi-card-deposit").hint).toBe(DEPOSIT_HINT);
    expect(card("kpi-card-final").title).toBe("Days to collect Final Payment");
    expect(card("kpi-card-final").hint).toBe(FINAL_HINT);
  });

  it("shows the range of the URL in the controls", () => {
    const html = renderToStaticMarkup(<KpiTab />);
    expect(html).toContain('value="2026-11-01"');
    expect(html).toContain('value="2026-11-30"');
  });
});

describe("the hints (D16)", () => {
  it("say what is counted, that early payments are not, and that a changed schedule changes it", () => {
    for (const hint of [DEPOSIT_HINT, FINAL_HINT]) {
      expect(hint).toContain("paid in full");
      expect(hint).toContain("A payment made before its due date is not counted.");
      expect(hint).toContain("Changing a payment schedule");
    }
  });

  it("Deposit says a booking with one payment or no schedule has no deposit", () => {
    expect(DEPOSIT_HINT).toContain("A booking with one payment or no schedule has no deposit.");
  });

  it("Final Payment says a booking with one payment or no schedule counts here", () => {
    expect(FINAL_HINT).toContain("A booking with one payment counts here");
    expect(FINAL_HINT).toContain("no schedule");
  });
});

describe("the numbers", () => {
  it("shows each card's average in whole days, rounded up, and how many payments (E7)", () => {
    data.rows = [
      row(8, "2026-11-10", "final", "a"),
      row(9, "2026-11-11", "final", "b"),
      row(11, "2026-11-12", "final", "c"),
      row(2, "2026-11-04", "deposit", "d"),
    ];
    renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-final")).toMatchObject({ value: "10 days", detail: "3 payments" });
    expect(card("kpi-card-deposit")).toMatchObject({ value: "2 days", detail: "1 payment" });
  });

  it("counts only the payments collected inside the range", () => {
    data.rows = [row(6, "2026-11-03", "final", "a"), row(20, "2026-10-20", "final", "b")];
    renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-final")).toMatchObject({ value: "6 days", detail: "1 payment" });
    cards.length = 0;
    range = { from: "2026-10-01", to: "2026-10-31" };
    renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-final")).toMatchObject({ value: "20 days", detail: "1 payment" });
  });

  it("All time counts every collected payment", () => {
    range = { from: null, to: null };
    data.rows = [row(2, "2020-01-01", "final", "a"), row(4, "2030-01-01", "final", "b")];
    renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-final")).toMatchObject({ value: "3 days", detail: "2 payments" });
  });

  it("no collected payment is a dash and 0 payments (C11)", () => {
    renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-deposit")).toMatchObject({ value: "–", detail: "0 payments" });
    expect(card("kpi-card-final")).toMatchObject({ value: "–", detail: "0 payments" });
  });

  it("0 days is a number: payments all collected on their due day", () => {
    data.rows = [row(0, "2026-11-10", "final", "a")];
    renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-final")).toMatchObject({ value: "0 days", detail: "1 payment" });
  });
});

describe("the states", () => {
  it("loading: both cards say Loading... with no count, never 0 payments", () => {
    data = { rows: undefined, isLoading: true, error: undefined };
    const html = renderToStaticMarkup(<KpiTab />);
    expect(card("kpi-card-deposit")).toMatchObject({ value: "Loading..." });
    expect(card("kpi-card-final")).toMatchObject({ value: "Loading..." });
    expect(card("kpi-card-deposit").detail).toBeUndefined();
    expect(html).not.toContain("0 payments");
  });

  it("error: the message, and no cards", () => {
    data = { rows: undefined, isLoading: false, error: new Error("boom") };
    const html = renderToStaticMarkup(<KpiTab />);
    expect(html).toContain("Could not load the KPIs.");
    expect(html).toContain('role="alert"');
    expect(cards).toHaveLength(0);
    expect(html).toContain('data-testid="audit-range-controls"');
  });

  it("From after To: the message, and no number", () => {
    range = { from: "2026-11-30", to: "2026-11-01" };
    isInverted = true;
    data.rows = [row(3, "2026-11-10", "final", "a")];
    const html = renderToStaticMarkup(<KpiTab />);
    expect(html).toContain("The start date is after the end date.");
    expect(html).toContain('role="alert"');
    expect(cards).toHaveLength(0);
  });
});
