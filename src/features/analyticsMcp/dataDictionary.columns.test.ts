import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

// docs/specs/analytics-mcp.md §11.6. tsc forces an entry for a new table, but not for a new column.
// This snapshot fails whenever a column is added or dropped, so someone asks "does Claude need a
// note to read this column correctly?" at the moment it appears.

/** Every "Table.column" in the public schema of database.types.ts (types are gone at runtime). */
function columnsFromDatabaseTypes(source: string): string[] {
  const start = source.indexOf("Tables: {");
  const end = source.indexOf("Views:", start);
  const tables = source.slice(start, end);
  const out: string[] = [];
  for (const m of tables.matchAll(/"(\w+)": \{\s*Row: \{([^}]*)\}/g)) {
    for (const c of m[2].matchAll(/"(\w+)":/g)) out.push(`${m[1]}.${c[1]}`);
  }
  return out.sort();
}

describe("data dictionary — columns", () => {
  it("reads the columns out of database.types.ts", () => {
    const sample = `Tables: { "A": { Row: { "id": string, "x_cents": number } Insert: {} } } Views: {}`;
    expect(columnsFromDatabaseTypes(sample)).toEqual(["A.id", "A.x_cents"]);
  });

  it("has a reviewed list matching the database's columns", async () => {
    const root = resolve(__dirname, "../../..");
    const columns = columnsFromDatabaseTypes(
      readFileSync(resolve(root, "database.types.ts"), "utf8"),
    );
    expect(columns.length).toBeGreaterThan(500); // the parser still understands the file
    await expect(
      columns.join("\n") + "\n",
      "A column was added or dropped. If its meaning is not obvious from its name (money, " +
        "currency, a status, a legacy/replaced column, a soft delete), add a note in " +
        "src/features/analyticsMcp/dataDictionary.ts. Then accept the list with: " +
        "npx vitest run src/features/analyticsMcp/dataDictionary.columns.test.ts -u",
    ).toMatchFileSnapshot("./__snapshots__/dataDictionary.columns.txt");
  });
});
