import { describe, expect, it } from "vitest";
import { ENTITY_SEARCH_LIMIT, searchEntities } from "./searchEntities";

type Row = { id: string; name: string };

const rows = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(i), name: `Row ${i}` }));

const byName = (r: Row) => r.name;

describe("searchEntities", () => {
  it("shows the first page of items when nothing is typed", () => {
    const result = searchEntities(rows(120), "", byName);

    expect(result.shown).toHaveLength(ENTITY_SEARCH_LIMIT);
    expect(result.shown[0].id).toBe("0");
    expect(result.matched).toBe(120);
    expect(result.hidden).toBe(120 - ENTITY_SEARCH_LIMIT);
  });

  it("hides nothing when everything fits", () => {
    const result = searchEntities(rows(3), "", byName);

    expect(result.shown).toHaveLength(3);
    expect(result.hidden).toBe(0);
  });

  it("filters case-insensitively on the search text, ignoring surrounding space", () => {
    const items: Row[] = [
      { id: "1", name: "Live Nation" },
      { id: "2", name: "AEG Presents" },
    ];

    expect(searchEntities(items, "  NATION ", byName).shown).toEqual([items[0]]);
    expect(searchEntities(items, "zzz", byName).matched).toBe(0);
  });

  it("counts every match but only returns a page of them", () => {
    const result = searchEntities(rows(200), "Row 1", byName, 10);

    // "Row 1", "Row 1x" and "Row 1xx" all match.
    expect(result.matched).toBe(111);
    expect(result.shown).toHaveLength(10);
    expect(result.hidden).toBe(101);
  });

  it("keeps the caller's order", () => {
    const items: Row[] = [
      { id: "b", name: "Beta" },
      { id: "a", name: "Alpha" },
    ];

    expect(searchEntities(items, "", byName).shown.map((r) => r.id)).toEqual(["b", "a"]);
  });
});
