import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let rows: { email: string | null }[];
let queryError: { message: string } | null;
const ilike = vi.fn();

vi.mock("@/utils/supabase/server", () => ({
  createServiceRoleClient: async () => ({
    from: (table: string) => ({
      select: (columns: string) => ({
        ilike: async (column: string, pattern: string) => {
          ilike(table, columns, column, pattern);
          return { data: queryError ? null : rows, error: queryError };
        },
      }),
    }),
  }),
}));

import { getDomainMailboxes, getMailboxDomain, pickDomainMailboxes } from "./mailboxes";

beforeEach(() => {
  rows = [];
  queryError = null;
  ilike.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getMailboxDomain", () => {
  it("defaults to bleacherrentals.com", () => {
    vi.stubEnv("GMAIL_MAILBOX_DOMAIN", "");

    expect(getMailboxDomain()).toBe("bleacherrentals.com");
  });

  it("can be pointed at a test Workspace", () => {
    vi.stubEnv("GMAIL_MAILBOX_DOMAIN", " TPI-3.ca ");

    expect(getMailboxDomain()).toBe("tpi-3.ca");
  });

  it("refuses something that is not a domain, since it goes into a query pattern", () => {
    vi.stubEnv("GMAIL_MAILBOX_DOMAIN", "%");
    expect(() => getMailboxDomain()).toThrow(/Not a domain/);

    vi.stubEnv("GMAIL_MAILBOX_DOMAIN", "a.com, b.com");
    expect(() => getMailboxDomain()).toThrow(/Not a domain/);
  });

  it("lets a caller ask for another domain, which wins over the configured one", () => {
    vi.stubEnv("GMAIL_MAILBOX_DOMAIN", "bleacherrentals.com");

    expect(getMailboxDomain("TPI-3.ca")).toBe("tpi-3.ca");
    expect(() => getMailboxDomain("evil.com/x")).toThrow(/Not a domain/);
  });
});

describe("pickDomainMailboxes", () => {
  it("keeps only exact-domain addresses, lowercased, de-duplicated and sorted", () => {
    expect(
      pickDomainMailboxes(
        [
          "Pat@BleacherRentals.com",
          "pat@bleacherrentals.com",
          "alex@bleacherrentals.com",
          "someone@gmail.com",
          "x@mail.bleacherrentals.com",
          "y@notbleacherrentals.com",
          "y@evil-bleacherrentals.com",
          "@bleacherrentals.com",
          null,
        ],
        "bleacherrentals.com",
      ),
    ).toEqual(["alex@bleacherrentals.com", "pat@bleacherrentals.com"]);
  });
});

describe("getDomainMailboxes", () => {
  it("lists the Users on the domain", async () => {
    vi.stubEnv("GMAIL_MAILBOX_DOMAIN", "");
    rows = [
      { email: "pat@bleacherrentals.com" },
      { email: "alex@bleacherrentals.com" },
      { email: null },
    ];

    expect(await getDomainMailboxes()).toEqual([
      "alex@bleacherrentals.com",
      "pat@bleacherrentals.com",
    ]);
    expect(ilike).toHaveBeenCalledWith("Users", "email", "email", "%@bleacherrentals.com");
  });

  it("returns an empty list when nobody is on the domain", async () => {
    expect(await getDomainMailboxes()).toEqual([]);
  });

  it("surfaces a failed lookup", async () => {
    queryError = { message: "boom" };

    await expect(getDomainMailboxes()).rejects.toThrow(/Could not list the .* mailboxes: boom/);
  });
});
