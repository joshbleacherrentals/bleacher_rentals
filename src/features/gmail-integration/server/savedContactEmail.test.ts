import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isSavedContactEmail } from "./savedContactEmail";

type Result = { data: unknown; error: { message: string } | null };
type Asked = { table: string; filters: [string, unknown][] };

/**
 * A stand-in for the service-role client. Each table answers its queries with the results it was
 * given, one per query, in order; a query it has no result left for fails the test.
 */
function fakeAdmin(tables: Record<string, Result[]>) {
  const asked: Asked[] = [];
  const queues = Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, [...r]]));

  const admin = {
    from(table: string) {
      const entry: Asked = { table, filters: [] };
      asked.push(entry);
      const next = () => {
        const result = queues[table]?.shift();
        if (!result) throw new Error(`Unexpected query on ${table}`);
        return result;
      };
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          entry.filters.push([column, value]);
          return chain;
        },
        in: (column: string, value: unknown) => {
          entry.filters.push([column, value]);
          return chain;
        },
        limit: () => chain,
        maybeSingle: () => Promise.resolve(next()),
        then: (resolve: (result: Result) => unknown) => resolve(next()),
      };
      return chain;
    },
  };
  return { admin: admin as any, asked };
}

const params = { mailbox: "paul@bleacherrentals.com", googleId: "1a15f4ce83c6ef44" };
const ok = (data: unknown): Result => ({ data, error: null });

describe("isSavedContactEmail", () => {
  it("is true for a copy that is on a contact", async () => {
    const { admin, asked } = fakeAdmin({
      EmailMessages: [ok({ id: "email-1", google_message_id: null })],
      ContactEmailMessages: [ok([{ contact_uuid: "c1" }])],
    });

    await expect(isSavedContactEmail(admin, params)).resolves.toBe(true);
    expect(asked[0].filters).toEqual([
      ["mailbox", "paul@bleacherrentals.com"],
      ["google_id", "1a15f4ce83c6ef44"],
    ]);
    expect(asked[1].filters).toEqual([["email_message_uuid", ["email-1"]]]);
  });

  it("is true when only another mailbox's copy of the same email is on a contact", async () => {
    const { admin, asked } = fakeAdmin({
      EmailMessages: [
        ok({ id: "email-1", google_message_id: "<abc@mail.gmail.com>" }),
        ok([{ id: "email-1" }, { id: "email-2" }]),
      ],
      ContactEmailMessages: [ok([{ contact_uuid: "c1" }])],
    });

    await expect(isSavedContactEmail(admin, params)).resolves.toBe(true);
    expect(asked[1].filters).toEqual([["google_message_id", "<abc@mail.gmail.com>"]]);
    expect(asked[2].filters).toEqual([["email_message_uuid", ["email-1", "email-2"]]]);
  });

  it("is false for an email that was never saved, without looking for contacts", async () => {
    const { admin, asked } = fakeAdmin({ EmailMessages: [ok(null)] });

    await expect(isSavedContactEmail(admin, params)).resolves.toBe(false);
    expect(asked).toHaveLength(1);
  });

  it("is false for a saved email, and its other copies, that are on no contact", async () => {
    const { admin } = fakeAdmin({
      EmailMessages: [
        ok({ id: "email-1", google_message_id: "<abc@mail.gmail.com>" }),
        ok([{ id: "email-1" }, { id: "email-2" }]),
      ],
      ContactEmailMessages: [ok([])],
    });

    await expect(isSavedContactEmail(admin, params)).resolves.toBe(false);
  });

  it("throws, rather than saying no, when the database cannot be read", async () => {
    const first = fakeAdmin({ EmailMessages: [{ data: null, error: { message: "db down" } }] });
    await expect(isSavedContactEmail(first.admin, params)).rejects.toThrow("db down");

    const copies = fakeAdmin({
      EmailMessages: [
        ok({ id: "email-1", google_message_id: "<abc@mail.gmail.com>" }),
        { data: null, error: { message: "copies down" } },
      ],
    });
    await expect(isSavedContactEmail(copies.admin, params)).rejects.toThrow("copies down");

    const links = fakeAdmin({
      EmailMessages: [ok({ id: "email-1", google_message_id: null })],
      ContactEmailMessages: [{ data: null, error: { message: "links down" } }],
    });
    await expect(isSavedContactEmail(links.admin, params)).rejects.toThrow("links down");
  });
});
