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

import { updateContact } from "./updateContact";

beforeEach(() => {
  executed.length = 0;
});

const contact = {
  firstName: "Marie",
  lastName: "Tremblay",
  phone: "555-0199",
  email: "marie@example.com",
  notes: "",
  companyUuid: null,
  defaultVenueUuid: null,
};

describe("updateContact", () => {
  it("persists a change of quote language", async () => {
    await updateContact("contact-1", { ...contact, preferredLanguage: "french" });

    expect(executed).toHaveLength(1);
    expect(executed[0].sql).toContain('update "Contacts"');
    expect(executed[0].parameters).toContain("french");
  });

  it("falls back to English when the caller omits the language", async () => {
    // Guards the regression a branch merge already caused once: a contact form
    // that stops passing preferredLanguage must not write an empty value.
    await updateContact("contact-1", contact);

    expect(executed[0].parameters).toContain("english");
  });
});

describe("updateContact default venue", () => {
  it("persists the default venue", async () => {
    await updateContact("contact-1", { ...contact, defaultVenueUuid: "venue-9" });

    expect(executed[0].sql).toContain('"default_venue_uuid" = ?');
    expect(executed[0].parameters).toContain("venue-9");
  });

  it("persists a cleared default venue as null", async () => {
    await updateContact("contact-1", { ...contact, defaultVenueUuid: null });

    expect(executed[0].sql).toContain('"default_venue_uuid" = ?');
  });
});
