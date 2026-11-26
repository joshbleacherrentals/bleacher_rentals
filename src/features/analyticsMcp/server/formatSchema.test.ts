import { describe, it, expect } from "vitest";
import { BUSINESS_RULES, DATA_DICTIONARY } from "../dataDictionary";
import { formatSchema, type SchemaColumn } from "./formatSchema";

// docs/specs/analytics-mcp.md §5 and §11: describe_schema is what lets Claude write correct joins and
// read the data the way the app does.
describe("formatSchema", () => {
  const col = (
    table_name: string,
    column_name: string,
    data_type: string,
    enum_labels: string | null = null,
  ): SchemaColumn => ({ table_name, column_name, data_type, enum_labels });

  const columns = [
    col("Events", "id", "uuid"),
    col("Events", "created_at", "timestamp with time zone"),
    col("Users", "id", "uuid"),
    col("Users", "email", "character varying"),
  ];
  const fks = [
    {
      table_name: "Events",
      definition: 'FOREIGN KEY (owner_user_uuid) REFERENCES "Users"(id)',
    },
  ];

  it("lists each table once with its columns and short type names", () => {
    const text = formatSchema(columns, []);
    expect(text).toContain('"Events"(id uuid, created_at timestamptz)');
    expect(text).toContain('"Users"(id uuid, email varchar)');
  });

  it("quotes table names, because the app's tables are PascalCase", () => {
    expect(formatSchema(columns, [])).not.toMatch(/^Events\(/m);
  });

  it("lists the foreign keys, so joins are easy to write", () => {
    const text = formatSchema(columns, fks);
    expect(text).toContain("Foreign keys");
    expect(text).toContain('"Events": FOREIGN KEY (owner_user_uuid) REFERENCES "Users"(id)');
  });

  it("omits the foreign keys section when there are none", () => {
    expect(formatSchema(columns, [])).not.toContain("Foreign keys");
  });

  it("says so when the role can see no tables", () => {
    expect(formatSchema([], [])).toMatch(/no tables/i);
  });

  it("prints an enum's values instead of USER-DEFINED (D10)", () => {
    const text = formatSchema(
      [col("Events", "event_status", "USER-DEFINED", "draft, quoted, booked")],
      [],
    );
    expect(text).toContain("event_status enum(draft|quoted|booked)");
    expect(text).not.toContain("USER-DEFINED");
  });

  describe("with a dictionary (§11)", () => {
    const dictionary = {
      Events: {
        purpose: "One quote or booking.",
        columns: { created_at: "When it was made.", gone_column: "Not live any more." },
      },
      NotLive: { purpose: "A table the database no longer has." },
    };
    const rules = [{ topic: "Money", rule: "Cents: divide by 100.", source: "x.ts" }];

    it("prints the table's purpose and notes on its columns", () => {
      const text = formatSchema(columns, [], dictionary, rules);
      expect(text).toContain("One quote or booking.");
      expect(text).toContain("created_at: When it was made.");
    });

    it("skips notes on columns and tables that are not live", () => {
      const text = formatSchema(columns, [], dictionary, rules);
      expect(text).not.toContain("gone_column");
      expect(text).not.toContain("NotLive");
    });

    it("still prints a live table that has no entry", () => {
      expect(formatSchema(columns, [], dictionary, rules)).toContain(
        '"Users"(id uuid, email varchar)',
      );
    });

    it("puts the business rules before the tables", () => {
      const text = formatSchema(columns, [], dictionary, rules);
      expect(text).toContain("Money: Cents: divide by 100.");
      expect(text.indexOf("Money:")).toBeLessThan(text.indexOf('"Events"('));
    });
  });

  it("stays a reasonable size with the real dictionary on every table (§11.4)", () => {
    // Every documented column, as if all were live: the worst case.
    const all: SchemaColumn[] = Object.entries(DATA_DICTIONARY).flatMap(([table, doc]) => [
      col(table, "id", "uuid"),
      ...Object.keys(doc.columns ?? {}).map((c) => col(table, c, "text")),
    ]);
    const text = formatSchema(all, [], DATA_DICTIONARY, BUSINESS_RULES);
    expect(text.length).toBeLessThan(80_000);
  });
});
