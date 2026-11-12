import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { GridBleacher } from "../hooks/useZoneBleachers";

// The grid reads its bleachers from the local database. That is stubbed; what is under test is what
// the grid draws: the label column, the seven days, and that it never scrolls sideways.
const { mockBleachers } = vi.hoisted(() => ({
  mockBleachers: {
    current: { bleachers: [] as GridBleacher[], isLoading: false },
  },
}));

vi.mock("../hooks/useZoneBleachers", () => ({
  useZoneBleachers: () => mockBleachers.current,
}));

import { WeekGrid } from "./WeekGrid";

const bleacher = (overrides: Partial<GridBleacher> = {}): GridBleacher => ({
  bleacherUuid: "b1",
  bleacherNumber: 42,
  bleacherRows: 7,
  bleacherSeats: 120,
  hasDevice: false,
  zoneName: "Calgary",
  storageLocationName: null,
  isAccessible: true,
  ...overrides,
});

const render = (weekStart = "2026-11-09") =>
  renderToStaticMarkup(<WeekGrid zoneId="zone-1" weekStart={weekStart} />);

const countOf = (html: string, needle: string) => html.split(needle).length - 1;

describe("WeekGrid", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-11T12:00:00Z")); // a Wednesday inside the week below
    mockBleachers.current = { bleachers: [bleacher()], isLoading: false };
  });
  afterEach(() => vi.useRealTimers());

  it("has a Bleachers corner and the seven days, Monday first and Sunday last", () => {
    const html = render();
    expect(html).toContain("Bleachers");
    const days = ["Mon, Nov 9", "Tue, Nov 10", "Wed, Nov 11", "Thu, Nov 12", "Fri, Nov 13"];
    days.push("Sat, Nov 14", "Sun, Nov 15");
    const positions = days.map((d) => html.indexOf(d));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(countOf(html, ">2026<")).toBe(7);
  });

  it("colours headers like the dashboard: today yellow, weekend dark grey, weekdays light grey", () => {
    const html = render();
    const header = (day: string) => {
      const at = html.indexOf(day);
      return html.slice(html.lastIndexOf("<div", html.lastIndexOf("<div", at) - 1), at);
    };
    expect(header("Wed, Nov 11")).toContain("background:#ffe020");
    expect(header("Sat, Nov 14")).toContain("background:#d1d5db");
    expect(header("Sun, Nov 15")).toContain("background:#d1d5db");
    expect(header("Mon, Nov 9")).toContain("background:#e5e7eb");
  });

  it("makes the seven days share the width beside a 175px label column, so it cannot scroll sideways", () => {
    const html = render();
    expect(html).toContain("grid-template-columns:175px repeat(7, minmax(0, 1fr))");
    expect(html).not.toMatch(/overflow-x|overflow-auto|overflow-scroll|min-w-/);
  });

  it("draws a label cell and seven blank tiles for each bleacher", () => {
    mockBleachers.current = {
      bleachers: [
        bleacher({ bleacherUuid: "b1", bleacherNumber: 1 }),
        bleacher({ bleacherUuid: "b2", bleacherNumber: 2 }),
        bleacher({ bleacherUuid: "b3", bleacherNumber: 3 }),
      ],
      isLoading: false,
    };
    const html = render();
    expect(countOf(html, 'data-testid="bleacher-label-cell"')).toBe(3);
    expect(countOf(html, 'data-testid="week-grid-tile"')).toBe(21);
  });

  it("shows the bleacher's number, rows, seats, zone and storage location in its label", () => {
    mockBleachers.current = {
      bleachers: [bleacher({ storageLocationName: "Airdrie Main Yard North" })],
      isLoading: false,
    };
    const html = render();
    expect(html).toContain(">42<");
    expect(html).toContain(">7row<");
    expect(html).toContain(">120seats<");
    expect(html).toContain(">Calgary<");
    // The dashboard cuts the storage location to its first 15 characters.
    expect(html).toContain(">Airdrie Main Ya<");
    expect(html).not.toContain("Airdrie Main Yard North");
  });

  it("colours the number by rows: green for 7, red for 10, yellow for 15", () => {
    const colourFor = (rows: number) => {
      mockBleachers.current = { bleachers: [bleacher({ bleacherRows: rows })], isLoading: false };
      return render();
    };
    expect(colourFor(7)).toContain("color:#15803d");
    expect(colourFor(10)).toContain("color:#b91c1c");
    expect(colourFor(15)).toContain("color:#eab308");
  });

  it("shows the map pin only for a bleacher with a tracking device", () => {
    expect(render()).not.toContain("/map-pin.png");
    mockBleachers.current = { bleachers: [bleacher({ hasDevice: true })], isLoading: false };
    expect(render()).toContain("/map-pin.png");
  });

  it("greys out a bleacher the viewer cannot access, label and tiles alike", () => {
    mockBleachers.current = { bleachers: [bleacher({ isAccessible: false })], isLoading: false };
    const html = render();
    expect(countOf(html, "background:#e6e6e6")).toBe(8); // the label and its seven tiles
    expect(html).not.toContain("background:#ffffff");
  });

  it("says so when the zone has no bleachers", () => {
    mockBleachers.current = { bleachers: [], isLoading: false };
    const html = render();
    expect(html).toContain("This zone has no bleachers.");
    expect(html).toContain("Mon, Nov 9");
  });
});
