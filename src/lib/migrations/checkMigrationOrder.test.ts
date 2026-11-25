import { describe, it, expect } from "vitest";
import {
  checkMigrationOrder,
  checkMigrationsUnchanged,
  migrationVersion,
} from "./checkMigrationOrder";

const production = [
  "20261117120000_analytics_mcp.sql",
  "20261123120000_maintenance_schema.sql",
  "20261124120000_maintenance_line_items_backfill.sql",
];

describe("migrationVersion", () => {
  it("is the timestamp before the first underscore, with or without a folder", () => {
    expect(migrationVersion("supabase/migrations/20261120120000_auto_fields.sql")).toBe(
      "20261120120000",
    );
  });
});

describe("checkMigrationOrder", () => {
  it("fails a new migration dated before the newest one in production", () => {
    expect(
      checkMigrationOrder({
        branchFiles: [...production, "20261120120000_auto_work_trackers_model_fields.sql"],
        productionFiles: production,
      }),
    ).toEqual({
      ok: false,
      latestInProduction: "20261124120000_maintenance_line_items_backfill.sql",
      outOfOrder: ["20261120120000_auto_work_trackers_model_fields.sql"],
    });
  });

  it("fails a new migration with the same timestamp as the newest in production", () => {
    const result = checkMigrationOrder({
      branchFiles: [...production, "20261124120000_other.sql"],
      productionFiles: production,
    });
    expect(result.ok).toBe(false);
  });

  it("passes new migrations dated after production's newest", () => {
    expect(
      checkMigrationOrder({
        branchFiles: [...production, "20261125120000_a.sql", "20261126120000_b.sql"],
        productionFiles: production,
      }),
    ).toEqual({ ok: true, added: ["20261125120000_a.sql", "20261126120000_b.sql"] });
  });

  it("passes a branch that adds no migration, and ignores non-SQL files", () => {
    expect(
      checkMigrationOrder({
        branchFiles: [...production, "README.md"],
        productionFiles: production,
      }),
    ).toEqual({ ok: true, added: [] });
  });

  it("passes anything when production has no migrations yet", () => {
    expect(
      checkMigrationOrder({ branchFiles: ["20200101000000_init.sql"], productionFiles: [] }).ok,
    ).toBe(true);
  });
});

describe("checkMigrationsUnchanged", () => {
  const a = { file: "supabase/migrations/20261117120000_a.sql", hash: "aaa" };
  const b = { file: "supabase/migrations/20261123120000_b.sql", hash: "bbb" };

  it("passes when every deployed migration is here unchanged, plus new ones", () => {
    expect(
      checkMigrationsUnchanged({
        branch: [a, b, { file: "supabase/migrations/20261125120000_new.sql", hash: "ccc" }],
        deployed: [
          { branch: "main", files: [a] },
          { branch: "develop", files: [a, b] },
        ],
      }),
    ).toEqual([]);
  });

  it("flags a deployed migration whose contents changed, on each branch it is on", () => {
    expect(
      checkMigrationsUnchanged({
        branch: [{ ...a, hash: "edited" }, b],
        deployed: [
          { branch: "main", files: [a] },
          { branch: "develop", files: [a, b] },
        ],
      }),
    ).toEqual([
      { file: "20261117120000_a.sql", branch: "main", change: "modified" },
      { file: "20261117120000_a.sql", branch: "develop", change: "modified" },
    ]);
  });

  it("flags a deployed migration that was deleted or renamed", () => {
    expect(
      checkMigrationsUnchanged({
        branch: [a, { file: "supabase/migrations/20261126120000_b.sql", hash: "bbb" }],
        deployed: [{ branch: "staging", files: [a, b] }],
      }),
    ).toEqual([{ file: "20261123120000_b.sql", branch: "staging", change: "deleted" }]);
  });

  it("ignores non-SQL files", () => {
    expect(
      checkMigrationsUnchanged({
        branch: [],
        deployed: [
          { branch: "main", files: [{ file: "supabase/migrations/README.md", hash: "x" }] },
        ],
      }),
    ).toEqual([]);
  });
});
