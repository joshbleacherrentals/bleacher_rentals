import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { guardEmailRecipients, guardUserRecipients } from "./guardRecipients";

function makeSupabase(result: { data?: { email: string }[] | null; error?: { message: string } }) {
  const from = vi.fn((_table: string) => ({
    select: vi.fn(() =>
      Promise.resolve({ data: result.data ?? null, error: result.error ?? null }),
    ),
  }));
  return { supabase: { from } as any, from };
}

const LIST = [{ email: "josh@bleacherrentals.com" }, { email: "Max@BleacherRentals.com" }];

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  errorSpy.mockRestore();
});

describe("outside development", () => {
  it.each([undefined, "staging", "production"])(
    "%j: lets every address through and never reads the list",
    async (env) => {
      if (env) vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", env);
      const { supabase, from } = makeSupabase({ data: LIST });

      const result = await guardEmailRecipients(supabase, {
        to: "abby@bleacherrentals.com",
        cc: "finance@bleacherrentals.com",
      });

      expect(result).toEqual({
        to: "abby@bleacherrentals.com",
        cc: "finance@bleacherrentals.com",
        blocked: [],
      });
      expect(from).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();
    },
  );
});

describe("in development", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "development"));

  it("reads DevAllowedEmails with the admin client", async () => {
    const { supabase, from } = makeSupabase({ data: LIST });
    await guardEmailRecipients(supabase, { to: "josh@bleacherrentals.com", cc: null });
    expect(from).toHaveBeenCalledWith("DevAllowedEmails");
  });

  it("sends to an allowed To and no CC", async () => {
    const { supabase } = makeSupabase({ data: LIST });
    const result = await guardEmailRecipients(supabase, {
      to: "JOSH@bleacherrentals.com",
      cc: null,
    });
    expect(result).toEqual({ to: "JOSH@bleacherrentals.com", cc: null, blocked: [] });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("drops a blocked finance CC but keeps the allowed To, and logs the dropped address", async () => {
    const { supabase } = makeSupabase({ data: LIST });
    const result = await guardEmailRecipients(supabase, {
      to: "josh@bleacherrentals.com",
      cc: "finance@bleacherrentals.com",
    });
    expect(result).toEqual({
      to: "josh@bleacherrentals.com",
      cc: null,
      blocked: ["finance@bleacherrentals.com"],
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = String(errorSpy.mock.calls[0][0]);
    expect(message).toContain("finance@bleacherrentals.com");
    expect(message).toContain("/dev-tools/allowed-emails");
  });

  it("returns no To when everything is blocked", async () => {
    const { supabase } = makeSupabase({ data: LIST });
    const result = await guardEmailRecipients(supabase, {
      to: "abby@bleacherrentals.com",
      cc: "finance@bleacherrentals.com",
    });
    expect(result.to).toBeNull();
    expect(result.cc).toBeNull();
    expect(result.blocked).toEqual(["abby@bleacherrentals.com", "finance@bleacherrentals.com"]);
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the list cannot be read — a broken allowlist must not become 'send to everyone'", async () => {
    const { supabase } = makeSupabase({
      error: { message: 'relation "DevAllowedEmails" does not exist' },
    });
    const result = await guardEmailRecipients(supabase, {
      to: "josh@bleacherrentals.com",
      cc: null,
    });
    expect(result.to).toBeNull();
    expect(result.blocked).toEqual(["josh@bleacherrentals.com"]);
    const messages = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(messages).toContain("Could not read DevAllowedEmails");
  });

  it("blocks everything when the list is empty", async () => {
    const { supabase } = makeSupabase({ data: [] });
    const result = await guardEmailRecipients(supabase, {
      to: "josh@bleacherrentals.com",
      cc: null,
    });
    expect(result.to).toBeNull();
    expect(result.blocked).toEqual(["josh@bleacherrentals.com"]);
  });
});

describe("guardUserRecipients", () => {
  const users = [
    { id: "1", email: "josh@bleacherrentals.com" },
    { id: "2", email: "abby@bleacherrentals.com" },
    { id: "3", email: "max@bleacherrentals.com" },
  ];

  it("returns every user untouched outside development", async () => {
    const { supabase, from } = makeSupabase({ data: LIST });
    const result = await guardUserRecipients(supabase, users);
    expect(result).toEqual({ allowed: users, blocked: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("keeps only the allowed users in development and logs each dropped one", async () => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "development");
    const { supabase } = makeSupabase({ data: LIST });
    const result = await guardUserRecipients(supabase, users);
    expect(result.allowed.map((u) => u.id)).toEqual(["1", "3"]);
    expect(result.blocked).toEqual(["abby@bleacherrentals.com"]);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
