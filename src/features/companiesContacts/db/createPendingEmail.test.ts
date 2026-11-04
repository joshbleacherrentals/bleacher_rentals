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

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

const batches: CompiledQuery[][] = [];
vi.mock("@/lib/powersync/typedQuery", () => ({
  typedExecuteBatch: async (statements: CompiledQuery[]) => {
    batches.push(statements);
  },
}));

import { createPendingEmail } from "./createPendingEmail";

const params = {
  contactUuid: "contact-1",
  sender: { address: "josh@bleacherrentals.com", name: "Josh Redgrift" },
  to: ["pat@xyz.com"],
  cc: [],
  subject: "Re: Quote",
  text: "Sounds good.",
  inReplyTo: "<b@x>",
  references: "<a@x> <b@x>",
};

beforeEach(() => {
  batches.length = 0;
});

describe("createPendingEmail", () => {
  it("saves the email, its link, its body and the pointer to the body in one batch, in that order", async () => {
    await createPendingEmail(params);

    expect(batches).toHaveLength(1);
    const sql = batches[0].map((statement) => statement.sql);
    expect(sql).toHaveLength(4);
    expect(sql[0]).toMatch(/^insert into "EmailMessages"/);
    expect(sql[1]).toMatch(/^insert into "ContactEmailMessages"/);
    expect(sql[2]).toMatch(/^insert into "EmailMessageDetails"/);
    expect(sql[3]).toMatch(/^update "EmailMessages" set "email_message_details_uuid" = \?/);
  });

  it("saves the email as being sent, with nothing from Gmail yet", async () => {
    await createPendingEmail(params);

    const [insert] = batches[0];
    const columns = (insert.sql.match(/\(([^)]*)\) values/)?.[1] ?? "")
      .split(",")
      .map((c) => c.trim().replace(/"/g, ""));
    const value = (column: string) => insert.parameters[columns.indexOf(column)];

    expect(value("status")).toBe("sending");
    expect(value("direction")).toBe("sent");
    expect(value("mailbox")).toBe("josh@bleacherrentals.com");
    expect(value("google_id")).toBeNull();
    expect(value("google_thread_id")).toBeNull();
    expect(value("subject")).toBe("Re: Quote");
  });

  it("returns the id of the new email, the one every statement refers to", async () => {
    const id = await createPendingEmail(params);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const [insert, link, details, pointer] = batches[0];
    expect(insert.parameters).toContain(id);
    expect(link.parameters).toContain(id);
    expect(details.parameters).toContain(id);
    expect(pointer.parameters).toContain(id);
    expect(link.parameters).toContain("contact-1");
  });

  it("points the email at the body it saved", async () => {
    await createPendingEmail(params);

    const [, , details, pointer] = batches[0];
    const columns = (details.sql.match(/\(([^)]*)\) values/)?.[1] ?? "")
      .split(",")
      .map((c) => c.trim().replace(/"/g, ""));
    const detailsId = details.parameters[columns.indexOf("id")];
    expect(pointer.parameters[0]).toBe(detailsId);
    expect(details.parameters).toContain("Sounds good.");
  });
});
