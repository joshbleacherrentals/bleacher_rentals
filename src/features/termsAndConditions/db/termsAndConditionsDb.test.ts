import { beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

let sqlite: DatabaseSync;
const executed: string[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
  powerSyncDb: {},
}));

vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToast: () => undefined }));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    executed.push(compiled.sql);
    sqlite.prepare(compiled.sql).run(...(compiled.parameters as any[]));
    return Promise.resolve();
  },
}));

import {
  createTermsAndConditions,
  setDefaultTermsAndConditions,
  softDeleteTermsAndConditions,
  updateTermsAndConditions,
} from "./termsAndConditionsDb";

/** id → is_default, as the page would read it back. */
function defaults(): Record<string, number> {
  const rows = sqlite.prepare("SELECT id, is_default FROM TermsAndConditions").all() as any[];
  return Object.fromEntries(rows.map((r) => [r.id, r.is_default]));
}

beforeEach(() => {
  executed.length = 0;
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE TermsAndConditions (
      id TEXT PRIMARY KEY, name TEXT, html_content TEXT, created_at TEXT, deleted INTEGER,
      is_default INTEGER
    );
  `);
  sqlite.prepare("INSERT INTO TermsAndConditions VALUES ('t-1', 'A', '', '', 0, 1)").run();
  sqlite.prepare("INSERT INTO TermsAndConditions VALUES ('t-2', 'B', '', '', 0, 0)").run();
});

describe("setDefaultTermsAndConditions", () => {
  it("moves the default to the chosen template", async () => {
    await setDefaultTermsAndConditions("t-2");

    expect(defaults()).toEqual({ "t-1": 0, "t-2": 1 });
  });

  it("clears the old default before setting the new one", async () => {
    // The server enforces one default with a partial unique index, and these two statements upload
    // in the order they were applied — setting first would collide with the row being replaced.
    await setDefaultTermsAndConditions("t-2");

    expect(executed).toHaveLength(2);
    expect(executed[0]).toContain('"is_default" = ?');
    expect(executed[0]).toContain('where "is_default"');
    expect(executed[1]).toContain('where "id"');
  });

  it("clears the default entirely when given null", async () => {
    await setDefaultTermsAndConditions(null);

    expect(defaults()).toEqual({ "t-1": 0, "t-2": 0 });
    expect(executed).toHaveLength(1);
  });

  it("is a no-op on the flags when the chosen template is already the default", async () => {
    await setDefaultTermsAndConditions("t-1");

    expect(defaults()).toEqual({ "t-1": 1, "t-2": 0 });
  });
});

function rowById(id: string): any {
  return sqlite.prepare("SELECT * FROM TermsAndConditions WHERE id = ?").get(id);
}

describe("createTermsAndConditions", () => {
  it("writes the template locally and returns its id", async () => {
    const id = await createTermsAndConditions({ name: "New", htmlContent: "<p>hi</p>" });

    const row = rowById(id);
    expect(row.name).toBe("New");
    expect(row.html_content).toBe("<p>hi</p>");
    expect(row.deleted).toBe(0);
    expect(row.is_default).toBe(0);
  });

  it("fills in what Postgres would have defaulted, since a local insert never reaches it", async () => {
    const id = await createTermsAndConditions({ name: "New", htmlContent: "" });

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rowById(id).created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("updateTermsAndConditions", () => {
  it("edits only the template asked for", async () => {
    await updateTermsAndConditions("t-2", { name: "Renamed", htmlContent: "<p>new</p>" });

    expect(rowById("t-2").name).toBe("Renamed");
    expect(rowById("t-2").html_content).toBe("<p>new</p>");
    expect(rowById("t-1").name).toBe("A");
  });
});

describe("softDeleteTermsAndConditions", () => {
  it("marks the template deleted", async () => {
    await softDeleteTermsAndConditions("t-2");

    expect(rowById("t-2").deleted).toBe(1);
  });

  it("gives up the default when the default is deleted", async () => {
    // The server's partial unique index ignores deleted rows, so leaving is_default set would
    // leave a default nobody can see and a slot nothing can take.
    await softDeleteTermsAndConditions("t-1");

    const row = rowById("t-1");
    expect(row.deleted).toBe(1);
    expect(row.is_default).toBe(0);
  });
});
