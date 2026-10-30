import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();
let user: { id: string; email: string } | null;

vi.mock("@/utils/supabase/server", () => ({
  createServiceRoleClient: async () => ({
    from: (table: string) =>
      table === "Users"
        ? {
            select: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: user, error: null }) }),
            }),
          }
        : { upsert },
  }),
}));

import { GmailEmailMismatchError, saveGmailRefreshToken } from "./db";
import { decryptToken } from "./tokenCrypto";

beforeEach(() => {
  vi.stubEnv("GMAIL_TOKEN_ENCRYPTION_KEY", crypto.randomBytes(32).toString("base64"));
  upsert.mockReset().mockResolvedValue({ error: null });
  user = { id: "user-uuid-1", email: "pat@bleacherrentals.com" };
});

describe("saveGmailRefreshToken", () => {
  it("upserts one encrypted row keyed on the user", async () => {
    await saveGmailRefreshToken("clerk_1", "1//refresh-token", "pat@bleacherrentals.com");

    const [row, options] = upsert.mock.calls[0];
    expect(options).toEqual({ onConflict: "user_uuid" });
    expect(row.user_uuid).toBe("user-uuid-1");
    expect(row.encrypted_token_value).not.toContain("1//refresh-token");
    expect(decryptToken(row.encrypted_token_value)).toBe("1//refresh-token");
  });

  it("accepts the same address in a different case", async () => {
    await saveGmailRefreshToken("clerk_1", "t", " Pat@BleacherRentals.com ");

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("refuses a Google account that is not the login email, and saves nothing", async () => {
    const attempt = saveGmailRefreshToken("clerk_1", "t", "someone.else@gmail.com");

    await expect(attempt).rejects.toBeInstanceOf(GmailEmailMismatchError);
    await expect(attempt).rejects.toThrow(/pat@bleacherrentals\.com/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("throws when there is no matching user and saves nothing", async () => {
    user = null;

    await expect(saveGmailRefreshToken("clerk_missing", "t", "a@b.com")).rejects.toThrow(
      "Could not find the user",
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it("surfaces a failed write", async () => {
    upsert.mockResolvedValue({ error: { message: "boom" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(saveGmailRefreshToken("clerk_1", "t", "pat@bleacherrentals.com")).rejects.toThrow(
      "Failed to save Gmail connection: boom",
    );
  });
});
