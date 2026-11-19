import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepairsToolbar, type RepairsToolbarProps } from "./RepairsToolbar";
import { SEARCH_HINT } from "../utils/repairFilters";

// docs/specs/repairs-05-toolbar.md §2.1, §2.2, §2.6 and §7 (D57, D60, D65). Rendered on the server:
// the 300 ms pause, the clearing and the clicks are effects, covered by e2e.

const EMPTY_OPTIONS = { bleacher: [], zone: [], vendor: [], category: [] };

const render = (props: Partial<RepairsToolbarProps> = {}) =>
  renderToStaticMarkup(
    <RepairsToolbar
      search=""
      bleacherUuids={[]}
      zoneUuids={[]}
      vendorUuids={[]}
      categoryUuids={[]}
      options={EMPTY_OPTIONS}
      optionsLoading={false}
      canShowDeleted={false}
      showDeleted={false}
      onChange={() => {}}
      {...props}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("RepairsToolbar search box", () => {
  it("is a search input with the hint of D57, a name and a width of 400 px", () => {
    const markup = render();
    expect(markup).toContain('type="search"');
    expect(markup).toContain('aria-label="Search repairs"');
    expect(markup).toContain(`placeholder="${SEARCH_HINT}"`);
    expect(markup).toContain("w-[400px]");
  });

  it("shows the typed text from the address", () => {
    expect(render({ search: "caprock" })).toContain('value="caprock"');
  });

  it("shows the clear button only while the box holds text (D60)", () => {
    expect(render({ search: "" })).not.toContain('data-testid="repairs-search-clear"');
    const markup = render({ search: "tire" });
    expect(markup).toContain('data-testid="repairs-search-clear"');
    expect(markup).toContain('aria-label="Clear search"');
  });

  it("hides the browser's own clear button, so the page draws only one", () => {
    expect(render()).toContain("webkit-search-cancel-button");
  });
});

describe("RepairsToolbar filters", () => {
  it("draws Bleacher, Zone, Vendor and Category in that order", () => {
    const markup = render();
    const at = (key: string) => markup.indexOf(`data-testid="repairs-filter-${key}"`);
    expect(at("bleacher")).toBeGreaterThan(-1);
    expect(at("zone")).toBeGreaterThan(at("bleacher"));
    expect(at("vendor")).toBeGreaterThan(at("zone"));
    expect(at("category")).toBeGreaterThan(at("vendor"));
    expect(markup.indexOf('type="search"')).toBeLessThan(at("bleacher"));
  });

  it("shows the number of ticked values on each button", () => {
    const markup = render({
      bleacherUuids: ["b1", "b2"],
      zoneUuids: [],
      vendorUuids: ["v1"],
      categoryUuids: ["c1", "c2", "c3"],
    });
    const button = (key: string) => {
      const at = markup.indexOf(`data-testid="repairs-filter-${key}"`);
      const start = markup.lastIndexOf("<button", at);
      return text(markup.slice(start, markup.indexOf("</button>", at)));
    };
    expect(button("bleacher")).toBe("Bleacher 2");
    expect(button("zone")).toBe("Zone");
    expect(button("vendor")).toBe("Vendor 1");
    expect(button("category")).toBe("Category 3");
  });

  it("has no Bleacher select any more (D63)", () => {
    expect(render()).not.toContain("<select");
    expect(text(render())).not.toContain("All bleachers");
  });
});

describe("RepairsToolbar Show Deleted (D41, D65)", () => {
  it("is not there for a role without the right", () => {
    expect(text(render({ canShowDeleted: false }))).not.toContain("Show Deleted");
    expect(text(render({ canShowDeleted: false, showDeleted: true }))).not.toContain("Deleted");
  });

  it("reads Show Deleted for a role that may, and Showing Deleted when it is on", () => {
    const off = render({ canShowDeleted: true });
    expect(text(off)).toContain("Show Deleted");
    expect(text(off)).not.toContain("Showing Deleted");
    const on = render({ canShowDeleted: true, showDeleted: true });
    expect(text(on)).toContain("Showing Deleted");
  });

  it("is the last thing in the toolbar", () => {
    const markup = render({ canShowDeleted: true });
    expect(markup.indexOf("Show Deleted")).toBeGreaterThan(
      markup.indexOf('data-testid="repairs-filter-category"'),
    );
  });
});
