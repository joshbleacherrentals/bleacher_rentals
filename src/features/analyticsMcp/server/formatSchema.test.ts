import { describe, it, expect } from "vitest";
import { formatSchema } from "./formatSchema";

// docs/specs/analytics-mcp.md §5: describe_schema is what lets Claude write correct joins.
describe("formatSchema", () => {
  const columns = [
    { table_name: "Events", column_name: "id", data_type: "uuid" },
    { table_name: "Events", column_name: "created_at", data_type: "timestamp with time zone" },
    { table_name: "Users", column_name: "id", data_type: "uuid" },
    { table_name: "Users", column_name: "email", data_type: "character varying" },
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
});
