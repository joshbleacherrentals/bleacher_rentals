import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isSavedContactEmail } from "./savedContactEmail";

type Result = { data: unknown; error: { message: string } | null };

/** A stand-in for the service-role client: every table answers with the result it was given. */
function fakeAdmin(tables: Record<string, Result>) {
  const asked: { table: string; filters: [string, unknown][] }[] = [];

  const admin = {
    from(table: string) {
      const entry = { table, filters: [] as [string, unknown][] };
      asked.push(entry);
      const chain: any = {
        select: () => chain,
        eq: (column: string, value: unknown) => {
          entry.filters.push([column, value]);
          return chain;
        },
        limit: () => chain,
        maybeSingle: () => Promise.resolve(tables[table]),
        then: (resolve: (result: Result) => unknown) => resolve(tables[table]),
      };
      return chain;
    },
  };
  return { admin: admin as any, asked };
}

const params = { mailbox: "paul@bleacherrentals.com", googleId: "1a15f4ce83c6ef44" };

describe("isSavedContactEmail", () => {
  it("is true for a saved copy that is on a contact", async () => {
    const { admin, asked } = fakeAdmin({
      EmailMessages: { data: { id: "email-1" }, error: null },
      ContactEmailMessages: { data: [{ contact_uuid: "c1" }], error: null },
    });

    await expect(isSavedContactEmail(admin, params)).resolves.toBe(true);
    expect(asked[0].filters).toEqual([
      ["mailbox", "paul@bleacherrentals.com"],
      ["google_id", "1a15f4ce83c6ef44"],
    ]);
    expect(asked[1].filters).toEqual([["email_message_uuid", "email-1"]]);
  });

  it("is false for an email that was never saved, without looking for contacts", async () => {
    const { admin, asked } = fakeAdmin({ EmailMessages: { data: null, error: null } });

    await expect(isSavedContactEmail(admin, params)).resolves.toBe(false);
    expect(asked).toHaveLength(1);
  });

  it("is false for a saved email that is on no contact", async () => {
    const { admin } = fakeAdmin({
      EmailMessages: { data: { id: "email-1" }, error: null },
      ContactEmailMessages: { data: [], error: null },
    });

    await expect(isSavedContactEmail(admin, params)).resolves.toBe(false);
  });

  it("throws, rather than saying no, when the database cannot be read", async () => {
    const { admin } = fakeAdmin({
      EmailMessages: { data: null, error: { message: "db down" } },
    });

    await expect(isSavedContactEmail(admin, params)).rejects.toThrow("db down");
  });
});
