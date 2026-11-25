import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepairFilterList, RepairFilterMenu, type RepairFilterListProps } from "./RepairFilterMenu";
import type { FilterOption } from "../utils/repairFilters";

// docs/specs/repairs-05-toolbar.md §2.3 and §7 (D61, D68). Rendered on the server: what is under
// test is the words, the marks and the attributes. Opening the dropdown is covered by e2e.

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const OPTIONS: FilterOption[] = [
  { value: "v1", label: "Caprock Tire", inactive: false },
  { value: "v2", label: "Old Shop", inactive: true },
  { value: "v3", label: "Suncoast", inactive: false },
];

const renderMenu = (selected: string[] = [], isLoading = false) =>
  renderToStaticMarkup(
    <RepairFilterMenu
      label="Vendor"
      filterKey="vendor"
      options={OPTIONS}
      selected={selected}
      isLoading={isLoading}
      onChange={() => {}}
    />,
  );

const renderList = (props: Partial<RepairFilterListProps> = {}) =>
  renderToStaticMarkup(
    <RepairFilterList
      label="Vendor"
      options={OPTIONS}
      selected={[]}
      isLoading={false}
      query=""
      onQueryChange={() => {}}
      onToggle={() => {}}
      onClear={() => {}}
      {...props}
    />,
  );

describe("RepairFilterMenu button", () => {
  it("shows its label and no badge while nothing is ticked", () => {
    const markup = renderMenu();
    expect(text(markup)).toBe("Vendor");
    expect(markup).toContain('data-testid="repairs-filter-vendor"');
    expect(markup).not.toContain("border-[#1d62a3]");
  });

  it("shows the number of ticked values and the blue outline when something is ticked", () => {
    const markup = renderMenu(["v1", "v3"]);
    expect(text(markup)).toBe("Vendor 2");
    expect(markup).toContain("border-[#1d62a3]");
  });

  it("counts a ticked value the list does not have, too", () => {
    expect(text(renderMenu(["ghost"]))).toBe("Vendor 1");
  });

  it("keeps counting while the lists load", () => {
    expect(text(renderMenu(["v1"], true))).toBe("Vendor 1");
  });

  it("is closed to start with: the list is not in the markup", () => {
    const markup = renderMenu(["v1"]);
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("menuitemcheckbox");
  });
});

describe("RepairFilterList", () => {
  it("draws one checkbox row per option, ticked for the selected values", () => {
    const markup = renderList({ selected: ["v3"] });
    const rows = [...markup.matchAll(/<button[^>]*role="menuitemcheckbox"[^>]*>/g)].map(
      (m) => m[0],
    );
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => /aria-checked="true"/.test(r))).toEqual([false, false, true]);
  });

  it("is a group named after its filter, with the search box and the Clear link", () => {
    const markup = renderList();
    expect(markup).toContain('role="group"');
    expect(markup).toContain('aria-label="Vendor filter"');
    expect(markup).toContain('placeholder="Search"');
    expect(markup).toContain('aria-label="Search in Vendor"');
    expect(text(markup)).toContain("Clear");
  });

  it("marks a switched-off option inactive and no other (D61)", () => {
    const markup = renderList();
    expect(text(markup)).toContain("Old Shop inactive");
    expect(markup.match(/inactive/g)).toHaveLength(1);
  });

  it("draws an Unknown row with the id in its title (D68)", () => {
    const markup = renderList({
      options: [{ value: "ghost-uuid", label: "Unknown", inactive: false }, ...OPTIONS],
      selected: ["ghost-uuid"],
    });
    expect(text(markup)).toContain("Unknown");
    expect(markup).toContain('title="ghost-uuid"');
    expect(markup).toMatch(/aria-checked="true"[^>]*>(?:(?!<button)[\s\S])*Unknown/);
  });

  it("shows only the options that match the search text", () => {
    const markup = renderList({ query: "sun" });
    expect(text(markup)).toContain("Suncoast");
    expect(text(markup)).not.toContain("Caprock");
    expect(markup).toContain('value="sun"');
  });

  it("says No matches when the search leaves nothing", () => {
    const markup = renderList({ query: "zzz" });
    expect(text(markup)).toContain("No matches");
    expect(markup).not.toContain("menuitemcheckbox");
  });

  it("says Loading... and draws no row while the lists load", () => {
    const markup = renderList({ isLoading: true });
    expect(text(markup)).toContain("Loading...");
    expect(markup).not.toContain("menuitemcheckbox");
  });
});
