import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkBlockedCustomerEmail } from "./blockedEmails";

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

describe("checkBlockedCustomerEmail", () => {
  it("blocks an address on the list", async () => {
    const { supabase, from } = fakeSupabase([{ email: "mike@bleacherrentals.com" }]);

    await expect(checkBlockedCustomerEmail(supabase, "mike@bleacherrentals.com")).resolves.toEqual({
      status: "blocked",
    });
    expect(from).toHaveBeenCalledWith("BlockedCustomerEmails");
  });

  it("ignores capitalization and stray spaces on either side", async () => {
    const { supabase } = fakeSupabase([{ email: "  Mike@BleacherRentals.com " }]);

    await expect(checkBlockedCustomerEmail(supabase, "MIKE@bleacherrentals.com")).resolves.toEqual({
      status: "blocked",
    });
  });

  it("allows an address that is not on the list, even one at the same company", async () => {
    const { supabase } = fakeSupabase([{ email: "mike@bleacherrentals.com" }]);

    await expect(checkBlockedCustomerEmail(supabase, "customer@xyz.com")).resolves.toEqual({
      status: "allowed",
    });
    await expect(checkBlockedCustomerEmail(supabase, "paul@bleacherrentals.com")).resolves.toEqual({
      status: "allowed",
    });
  });

  it("matches the whole address, not part of it", async () => {
    const { supabase } = fakeSupabase([{ email: "mike@bleacherrentals.com" }]);

    for (const address of [
      "ike@bleacherrentals.com",
      "mike@bleacherrentals.com.au",
      "m_ke@bleacherrentals.com",
    ]) {
      await expect(checkBlockedCustomerEmail(supabase, address)).resolves.toEqual({
        status: "allowed",
      });
    }
  });

  it("allows everything when the list is empty", async () => {
    const { supabase } = fakeSupabase([]);

    await expect(checkBlockedCustomerEmail(supabase, "mike@bleacherrentals.com")).resolves.toEqual({
      status: "allowed",
    });
  });

  it("finds an address past the first page, so a long list cannot hide one", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ email: `person${i}@example.com` }));
    rows.push({ email: "mike@bleacherrentals.com" });
    const { supabase, ranges } = fakeSupabase(rows, { pageSize: 1000 });

    await expect(checkBlockedCustomerEmail(supabase, "mike@bleacherrentals.com")).resolves.toEqual({
      status: "blocked",
    });
    expect(ranges.length).toBeGreaterThan(1);
  });

  it("does not treat a null email in the table as a match", async () => {
    const { supabase } = fakeSupabase([{ email: null }]);

    await expect(checkBlockedCustomerEmail(supabase, "mike@bleacherrentals.com")).resolves.toEqual({
      status: "allowed",
    });
  });

  it("reports the list as unreadable instead of allowing, and logs why", async () => {
    const { supabase } = fakeSupabase([], { error: "connection refused" });

    await expect(checkBlockedCustomerEmail(supabase, "mike@bleacherrentals.com")).resolves.toEqual({
      status: "unreadable",
      message: "connection refused",
    });
    expect(errorSpy).toHaveBeenCalledOnce();
  });
});
