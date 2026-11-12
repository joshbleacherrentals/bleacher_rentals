import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { LucideIcon } from "lucide-react";
import {
  WORK_TRACKER_TYPE_STYLES,
  WORK_TRACKER_TYPE_STYLE_FALLBACK,
  type WorkTrackerTypeStyle,
} from "@/features/workTrackers/constants";
import { WorkTrackerTypeBadge } from "./WorkTrackerTypeBadge";

// docs/specs/accountant-audit-04-table.md §3 and §5 (D10, R4).

/** The `lucide-…` class an icon draws, so two icons can be told apart in markup. */
const iconClass = (Icon: LucideIcon) =>
  renderToStaticMarkup(<Icon />).match(/lucide-[a-z0-9-]+/)?.[0] ?? "";

function expectStyle(html: string, style: WorkTrackerTypeStyle) {
  expect(html).toContain(style.bg);
  expect(html).toContain(style.border);
  expect(html).toContain(style.text);
  expect(html).toContain(iconClass(style.icon));
}

describe("WorkTrackerTypeBadge", () => {
  it.each(["trip", "repair_maintenance", "site_visit_cleaning_other"])(
    "takes the icon and the colours of the canonical code %s",
    (code) => {
      const html = renderToStaticMarkup(<WorkTrackerTypeBadge code={code} name="Any name" />);
      expectStyle(html, WORK_TRACKER_TYPE_STYLES[code]);
      expect(html).toContain(">Any name<");
    },
  );

  it("uses a different icon for each of the three canonical codes", () => {
    const icons = ["trip", "repair_maintenance", "site_visit_cleaning_other"].map((c) =>
      iconClass(WORK_TRACKER_TYPE_STYLES[c].icon),
    );
    expect(new Set(icons).size).toBe(3);
  });

  it("shows the name of the type, so a renamed type shows its new name", () => {
    const html = renderToStaticMarkup(<WorkTrackerTypeBadge code="trip" name="Haul" />);
    expect(html).toContain(">Haul<");
  });

  it("takes the fallback style for an unknown code", () => {
    const html = renderToStaticMarkup(<WorkTrackerTypeBadge code="mystery" name="Mystery" />);
    expectStyle(html, WORK_TRACKER_TYPE_STYLE_FALLBACK);
    expect(html).toContain(">Mystery<");
  });

  it("takes the fallback style for a null code", () => {
    const html = renderToStaticMarkup(<WorkTrackerTypeBadge code={null} name="Legacy" />);
    expectStyle(html, WORK_TRACKER_TYPE_STYLE_FALLBACK);
    expect(html).toContain(">Legacy<");
  });

  it("does not mistake an inherited object key for a code", () => {
    const html = renderToStaticMarkup(<WorkTrackerTypeBadge code="constructor" name="X" />);
    expectStyle(html, WORK_TRACKER_TYPE_STYLE_FALLBACK);
  });

  it("is a rounded-md bordered inline badge with a 14px icon hidden from assistive technology", () => {
    const html = renderToStaticMarkup(<WorkTrackerTypeBadge code="trip" name="Trip" />);
    expect(html).toContain("inline-flex");
    expect(html).toContain("rounded-md");
    expect(html).toContain("border");
    expect(html).toContain("text-[13px]");
    const svg = html.match(/<svg[^>]*>/)?.[0] ?? "";
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('width="14"');
    expect(svg).toContain('height="14"');
  });

  it("renders a dash and no badge for a null name", () => {
    const html = renderToStaticMarkup(<WorkTrackerTypeBadge code="trip" name={null} />);
    expect(html).toContain(">–<");
    expect(html).not.toContain("<svg");
  });
});
