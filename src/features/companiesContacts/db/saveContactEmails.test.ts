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

// What the local database "already has", keyed by which table the lookup reads.
let savedEmails: { id: string; mailbox: string; google_id: string }[];
let savedLinks: { contact_uuid: string; email_message_uuid: string }[];
const batches: CompiledQuery[][] = [];

vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: async (compiled: CompiledQuery) => {
    if (compiled.sql.includes('from "ContactEmailMessages"')) {
      // The real query filters on both the contact and the message ids.
      return savedLinks.filter(
        (l) =>
          compiled.parameters.includes(l.contact_uuid) &&
          compiled.parameters.includes(l.email_message_uuid),
      );
    }
    return savedEmails.filter((e) => compiled.parameters.includes(e.google_id));
  },
  typedExecuteBatch: async (statements: CompiledQuery[]) => {
    batches.push(statements);
  },
}));

import { copyKey, planContactEmailSave, saveContactEmails } from "./saveContactEmails";
import type { PulledEmail } from "../logic/emailActivity";

const email = (over: Partial<PulledEmail> = {}): PulledEmail => ({
  messageId: "<m1@x>",
  copies: [{ mailbox: "paul@co.com", id: "g1", threadId: "t1" }],
  from: "Pat <pat@xyz.com>",
  to: "me@co.com",
  cc: null,
  subject: "Hi",
  date: null,
  internalDate: 1792600225000,
  snippet: "Hello",
  direction: "received",
  ...over,
});

const twoCopies = email({
  copies: [
    { mailbox: "paul@co.com", id: "g1", threadId: "t1" },
    { mailbox: "josh@co.com", id: "g2", threadId: "t9" },
  ],
});

let counter: number;
const newId = () => `new-${++counter}`;

beforeEach(() => {
  counter = 0;
  savedEmails = [];
  savedLinks = [];
  batches.length = 0;
});

describe("planContactEmailSave", () => {
  const base = {
    contactUuid: "contact-1",
    savedCopies: new Map<string, string>(),
    linkedIds: new Set<string>(),
    now: "2026-10-28T00:00:00.000Z",
  };

  it("makes a row per mailbox copy, with the mailbox, and links the contact once to the first copy", () => {
    const out = planContactEmailSave({ ...base, emails: [twoCopies], newId });

    expect(out.newEmails.map((r) => [r.id, r.mailbox, r.google_id, r.google_thread_id])).toEqual([
      ["new-1", "paul@co.com", "g1", "t1"],
      ["new-2", "josh@co.com", "g2", "t9"],
    ]);
    expect(out.newEmails.every((r) => r.google_message_id === "<m1@x>")).toBe(true);
    expect(out.newEmails[0]).toMatchObject({
      created_at: base.now,
      from_address: "Pat <pat@xyz.com>",
      to_addresses: "me@co.com",
      cc_addresses: null,
      subject: "Hi",
      date: new Date(1792600225000).toISOString(),
      snippet: "Hello",
      direction: "received",
    });
    expect(out.newLinks).toEqual([
      { id: "new-3", created_at: base.now, contact_uuid: "contact-1", email_message_uuid: "new-1" },
    ]);
  });

  it("saves an email that appears twice in the pull once", () => {
    const out = planContactEmailSave({ ...base, emails: [email(), email()], newId });

    expect(out.newEmails).toHaveLength(1);
    expect(out.newLinks).toHaveLength(1);
  });

  it("reuses a saved copy, adds only the missing one, and does not link twice", () => {
    const out = planContactEmailSave({
      ...base,
      emails: [twoCopies],
      savedCopies: new Map([[copyKey("paul@co.com", "g1"), "existing-1"]]),
      linkedIds: new Set(["existing-1"]),
      newId,
    });

    expect(out.copiesAlreadySaved).toBe(1);
    expect(out.newEmails.map((r) => r.mailbox)).toEqual(["josh@co.com"]);
    expect(out.newLinks).toEqual([]);
  });

  it("counts a contact linked to any copy as already linked", () => {
    const out = planContactEmailSave({
      ...base,
      emails: [twoCopies],
      savedCopies: new Map([
        [copyKey("paul@co.com", "g1"), "existing-1"],
        [copyKey("josh@co.com", "g2"), "existing-2"],
      ]),
      linkedIds: new Set(["existing-2"]),
      newId,
    });

    expect(out.newEmails).toEqual([]);
    expect(out.newLinks).toEqual([]);
  });

  it("links a second contact to the already-saved primary copy", () => {
    const out = planContactEmailSave({
      ...base,
      emails: [email()],
      savedCopies: new Map([[copyKey("paul@co.com", "g1"), "existing-1"]]),
      newId,
    });

    expect(out.newEmails).toEqual([]);
    expect(out.newLinks.map((l) => l.email_message_uuid)).toEqual(["existing-1"]);
  });

  it("identifies an email with no Message-ID by its first copy", () => {
    const noId = email({ messageId: null });
    const out = planContactEmailSave({ ...base, emails: [noId, noId], newId });

    expect(out.newEmails).toHaveLength(1);
    expect(out.newEmails[0].google_message_id).toBeNull();
  });
});

describe("saveContactEmails", () => {
  it("writes the copies and one link in one transaction, emails first", async () => {
    const out = await saveContactEmails("contact-1", [twoCopies]);

    expect(out).toEqual({ added: 1, copiesAdded: 2 });
    expect(batches).toHaveLength(1);
    const sql = batches[0].map((s) => s.sql);
    expect(sql[0]).toMatch(/^insert into "EmailMessages"/);
    expect(sql[0]).toContain('"mailbox"');
    expect(batches[0][0].parameters).toContain("paul@co.com");
    expect(batches[0][0].parameters).toContain("josh@co.com");
    expect(sql[1]).toMatch(/^insert into "ContactEmailMessages"/);
  });

  it("does not save anything twice when pulled again", async () => {
    savedEmails = [{ id: "existing-1", mailbox: "paul@co.com", google_id: "g1" }];
    savedLinks = [{ contact_uuid: "contact-1", email_message_uuid: "existing-1" }];

    const out = await saveContactEmails("contact-1", [email()]);

    expect(out).toEqual({ added: 0, copiesAdded: 0 });
    expect(batches[0]).toEqual([]);
  });

  it("links an already-saved email to a second contact without copying it", async () => {
    savedEmails = [{ id: "existing-1", mailbox: "paul@co.com", google_id: "g1" }];
    savedLinks = [{ contact_uuid: "contact-1", email_message_uuid: "existing-1" }];

    const out = await saveContactEmails("contact-2", [email()]);

    expect(out).toEqual({ added: 1, copiesAdded: 0 });
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].sql).toMatch(/^insert into "ContactEmailMessages"/);
    expect(batches[0][0].parameters).toContain("contact-2");
    expect(batches[0][0].parameters).toContain("existing-1");
  });

  it("does not mistake the same Gmail id in another mailbox for a saved copy", async () => {
    savedEmails = [{ id: "other-mailbox-row", mailbox: "someone@co.com", google_id: "g1" }];

    const out = await saveContactEmails("contact-1", [email()]);

    expect(out.copiesAdded).toBe(1);
    expect(batches[0][1].parameters).not.toContain("other-mailbox-row");
  });

  it("does nothing for an empty pull", async () => {
    expect(await saveContactEmails("contact-1", [])).toEqual({ added: 0, copiesAdded: 0 });
    expect(batches).toEqual([]);
  });

  it("splits a big pull into several inserts under the parameter limit", async () => {
    const many = Array.from({ length: 120 }, (_, i) =>
      email({
        messageId: `<m${i}@x>`,
        copies: [{ mailbox: "paul@co.com", id: `g${i}`, threadId: "t" }],
      }),
    );

    await saveContactEmails("contact-1", many);

    const emailInserts = batches[0].filter((s) => s.sql.startsWith('insert into "EmailMessages"'));
    expect(emailInserts).toHaveLength(3); // 50 + 50 + 20
    expect(Math.max(...batches[0].map((s) => s.parameters.length))).toBeLessThan(999);
  });
});
