import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkBlockedCustomerEmail, COMPANY_DOMAINS } from "./blockedEmails";

/**
 * A stand-in for the service-role client that serves `rows` the way PostgREST does: one page of at
 * most `pageSize` rows per `.range(from, to)`, in the order asked for.
 */
function fakeSupabase(
  rows: { email: string | null }[],
  options: { error?: string; pageSize?: number } = {},
) {
  const ranges: [number, number][] = [];
  const from = vi.fn((_table: string) => ({
    select: (_columns: string) => ({
      order: (_column: string) => ({
        range: async (start: number, end: number) => {
          ranges.push([start, end]);
          if (options.error) return { data: null, error: { message: options.error } };
          const cap = options.pageSize ?? Infinity;
          return { data: rows.slice(start, Math.min(end + 1, start + cap)), error: null };
        },
      }),
    }),
  }));
  return { supabase: { from } as any, from, ranges };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe("company domains", () => {
  it("are bleacherrentals.com and tpi-3.ca", () => {
    expect(COMPANY_DOMAINS).toEqual(["bleacherrentals.com", "tpi-3.ca"]);
  });

  it.each([
    ["mike@bleacherrentals.com", "bleacherrentals.com"],
    ["krista@tpi-3.ca", "tpi-3.ca"],
  ])("blocks %s without needing it on the list", async (address, domain) => {
    const { supabase } = fakeSupabase([]);

    await expect(checkBlockedCustomerEmail(supabase, address)).resolves.toEqual({
      status: "blocked",
      reason: "company-domain",
      domain,
    });
  });

  it("never reads the list for one, so an unreadable list cannot change the answer", async () => {
    const { supabase, from } = fakeSupabase([], { error: "connection refused" });

    await expect(
      checkBlockedCustomerEmail(supabase, "mike@bleacherrentals.com"),
    ).resolves.toMatchObject({ status: "blocked", reason: "company-domain" });
    expect(from).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("ignores capitalization and stray spaces", async () => {
    const { supabase } = fakeSupabase([]);

    await expect(
      checkBlockedCustomerEmail(supabase, "  Mike@BleacherRentals.COM "),
    ).resolves.toMatchObject({ status: "blocked", reason: "company-domain" });
  });

  it("covers a subdomain of a company domain", async () => {
    const { supabase } = fakeSupabase([]);

    await expect(
      checkBlockedCustomerEmail(supabase, "alerts@mail.bleacherrentals.com"),
    ).resolves.toMatchObject({ status: "blocked", reason: "company-domain" });
  });

  it.each([
    "customer@notbleacherrentals.com",
    "customer@bleacherrentals.com.au",
    "customer@bleacherrentals.co",
    "customer@tpi-3.ca.example.com",
    "customer@xtpi-3.ca",
    "bleacherrentals.com@gmail.com",
  ])("does not mistake %s for a company address", async (address) => {
    const { supabase } = fakeSupabase([]);

    await expect(checkBlockedCustomerEmail(supabase, address)).resolves.toEqual({
      status: "allowed",
    });
  });
});

describe("checkBlockedCustomerEmail", () => {
  it("blocks an address on the list", async () => {
    const { supabase, from } = fakeSupabase([{ email: "pat@xyz.com" }]);

    await expect(checkBlockedCustomerEmail(supabase, "pat@xyz.com")).resolves.toEqual({
      status: "blocked",
      reason: "listed",
    });
    expect(from).toHaveBeenCalledWith("BlockedCustomerEmails");
  });

  it("ignores capitalization and stray spaces on either side", async () => {
    const { supabase } = fakeSupabase([{ email: "  Pat@XYZ.com " }]);

    await expect(checkBlockedCustomerEmail(supabase, "PAT@xyz.com")).resolves.toEqual({
      status: "blocked",
      reason: "listed",
    });
  });

  it("allows an address that is not on the list, even one at the same company as a listed one", async () => {
    const { supabase } = fakeSupabase([{ email: "pat@xyz.com" }]);

    await expect(checkBlockedCustomerEmail(supabase, "customer@xyz.com")).resolves.toEqual({
      status: "allowed",
    });
  });

  it("matches the whole address, not part of it", async () => {
    const { supabase } = fakeSupabase([{ email: "pat@xyz.com" }]);

    for (const address of ["at@xyz.com", "pat@xyz.com.au", "p_t@xyz.com"]) {
      await expect(checkBlockedCustomerEmail(supabase, address)).resolves.toEqual({
        status: "allowed",
      });
    }
  });

  it("allows everything when the list is empty", async () => {
    const { supabase } = fakeSupabase([]);

    await expect(checkBlockedCustomerEmail(supabase, "pat@xyz.com")).resolves.toEqual({
      status: "allowed",
    });
  });

  it("finds an address past the first page, so a long list cannot hide one", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ email: `person${i}@example.com` }));
    rows.push({ email: "pat@xyz.com" });
    const { supabase, ranges } = fakeSupabase(rows, { pageSize: 1000 });

    await expect(checkBlockedCustomerEmail(supabase, "pat@xyz.com")).resolves.toEqual({
      status: "blocked",
      reason: "listed",
    });
    expect(ranges.length).toBeGreaterThan(1);
  });

  it("does not treat a null email in the table as a match", async () => {
    const { supabase } = fakeSupabase([{ email: null }]);

    await expect(checkBlockedCustomerEmail(supabase, "pat@xyz.com")).resolves.toEqual({
      status: "allowed",
    });
  });

  it("reports the list as unreadable instead of allowing, and logs why", async () => {
    const { supabase } = fakeSupabase([], { error: "connection refused" });

    await expect(checkBlockedCustomerEmail(supabase, "pat@xyz.com")).resolves.toEqual({
      status: "unreadable",
      message: "connection refused",
    });
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
