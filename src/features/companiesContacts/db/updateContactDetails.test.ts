import { beforeEach, describe, expect, it, vi } from "vitest";
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

const executed: CompiledQuery[] = [];

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecute: (compiled: CompiledQuery) => {
    executed.push(compiled);
    return Promise.resolve();
  },
}));

import {
  updateContactEmail,
  updateContactLanguage,
  updateContactNotes,
  updateContactPhone,
} from "./updateContactDetails";

beforeEach(() => {
  executed.length = 0;
});

describe("updateContactEmail", () => {
  it("writes only the email column, trimmed", async () => {
    await updateContactEmail("contact-1", "  marie@example.com ");

    expect(executed[0].sql).toBe('update "Contacts" set "email" = ? where "id" = ?');
    expect(executed[0].parameters).toEqual(["marie@example.com", "contact-1"]);
  });

  it("stores a blank email as null", async () => {
    await updateContactEmail("contact-1", "   ");

    expect(executed[0].parameters).toEqual([null, "contact-1"]);
  });
});

describe("updateContactPhone", () => {
  it("writes only the phone column, as typed but trimmed", async () => {
    await updateContactPhone("contact-1", " (555) 123-4567 ");

    expect(executed[0].sql).toBe('update "Contacts" set "phone" = ? where "id" = ?');
    expect(executed[0].parameters).toEqual(["(555) 123-4567", "contact-1"]);
  });

  it("stores a blank phone as null", async () => {
    await updateContactPhone("contact-1", "");

    expect(executed[0].parameters).toEqual([null, "contact-1"]);
  });
});

describe("updateContactLanguage", () => {
  it("writes only the language column", async () => {
    await updateContactLanguage("contact-1", "french");

    expect(executed[0].sql).toBe('update "Contacts" set "preferred_language" = ? where "id" = ?');
    expect(executed[0].parameters).toEqual(["french", "contact-1"]);
  });
});

describe("updateContactNotes", () => {
  it("writes only the notes column, trimmed, and keeps line breaks inside", async () => {
    await updateContactNotes("contact-1", "  Call after 5pm\nAsk for Pat \n");

    expect(executed[0].sql).toBe('update "Contacts" set "notes" = ? where "id" = ?');
    expect(executed[0].parameters).toEqual(["Call after 5pm\nAsk for Pat", "contact-1"]);
  });

  it("stores blank notes as null", async () => {
    await updateContactNotes("contact-1", " \n ");

    expect(executed[0].parameters).toEqual([null, "contact-1"]);
  });
});
