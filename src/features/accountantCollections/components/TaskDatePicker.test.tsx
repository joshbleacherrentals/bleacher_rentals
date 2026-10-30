import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  monthCells,
  monthTitle,
  shiftMonth,
  TaskDatePicker,
  TaskMonthGrid,
} from "./TaskDatePicker";

const TODAY = "2026-11-10";

describe("month helpers", () => {
  it("shifts a month across the year", () => {
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("titles a month in words", () => {
    expect(monthTitle("2026-11")).toBe("November 2026");
  });

  it("lays out a month Sunday first, with blanks before the 1st", () => {
    // 1 November 2026 is a Sunday; 1 December 2026 is a Tuesday.
    expect(monthCells("2026-11")).toHaveLength(30);
    expect(monthCells("2026-11")[0]).toBe("2026-11-01");
    const december = monthCells("2026-12");
    expect(december).toHaveLength(2 + 31);
    expect(december.slice(0, 2)).toEqual([null, null]);
    expect(december[2]).toBe("2026-12-01");
  });
});

describe("TaskMonthGrid", () => {
  const render = (over: Partial<React.ComponentProps<typeof TaskMonthGrid>> = {}) =>
    renderToStaticMarkup(
      <TaskMonthGrid
        month="2026-11"
        today={TODAY}
        selected="2026-11-12"
        onPick={() => {}}
        onMonthChange={() => {}}
        {...over}
      />,
    );

  const day = (html: string, label: string) =>
    html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))![0];

  it("titles the month it shows", () => {
    expect(render()).toContain("November 2026");
  });

  it("disables the days before today and offers today and later", () => {
    const html = render();
    expect(day(html, "November 9, 2026")).toContain('disabled=""');
    expect(day(html, "November 1, 2026")).toContain('disabled=""');
    expect(day(html, "November 10, 2026")).not.toContain("disabled");
    expect(day(html, "November 11, 2026")).not.toContain("disabled");
  });

  it("rings today and fills the selected day", () => {
    const html = render();
    expect(day(html, "November 10, 2026")).toContain('aria-current="date"');
    expect(day(html, "November 10, 2026")).toContain("ring-1");
    expect(day(html, "November 12, 2026")).toContain('aria-pressed="true"');
    expect(day(html, "November 12, 2026")).toContain("bg-darkBlue");
    expect(day(html, "November 13, 2026")).toContain('aria-pressed="false"');
  });

  it("does not ring today when it is the selected day", () => {
    const html = render({ selected: TODAY });
    expect(day(html, "November 10, 2026")).toContain("bg-darkBlue");
    expect(day(html, "November 10, 2026")).not.toContain("ring-1");
  });

  it("has previous and next month arrows, the previous one off in today's month", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Previous month"/);
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*aria-label="Next month"/);
  });

  it("allows going back from a later month, and offers every day of it", () => {
    const html = render({ month: "2026-12", selected: "2026-12-02" });
    expect(html).toContain("December 2026");
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*aria-label="Previous month"/);
    expect(day(html, "December 1, 2026")).not.toContain("disabled");
  });
});

describe("TaskDatePicker", () => {
  it("shows its label on a button that opens the calendar", () => {
    const html = renderToStaticMarkup(
      <TaskDatePicker value="2026-11-12" today={TODAY} label="2 Days" onChange={() => {}} />,
    );
    expect(html).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*>[^]*2 Days/);
    expect(html).toContain('aria-expanded="false"');
  });
});
