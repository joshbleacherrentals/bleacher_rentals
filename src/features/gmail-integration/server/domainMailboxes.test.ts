import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

const listDirectoryMailboxes = vi.fn();
vi.mock("./directory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./directory")>()),
  listDirectoryMailboxes: (args: unknown) => listDirectoryMailboxes(args),
}));

const getDomainMailboxes = vi.fn();
vi.mock("./mailboxes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./mailboxes")>()),
  getDomainMailboxes: (domain: string) => getDomainMailboxes(domain),
}));

import { parseMailboxSourceParams, resolveDomainMailboxes } from "./domainMailboxes";

beforeEach(() => {
  vi.stubEnv("GMAIL_MAILBOX_DOMAIN", "");
  vi.stubEnv("GMAIL_DIRECTORY_ADMINS", "josh@tpi-3.ca, krista@bleacherrentals.com");
  listDirectoryMailboxes.mockReset().mockResolvedValue({
    mailboxes: ["a@tpi-3.ca"],
    accounts: 2,
    skippedNoMailbox: 1,
  });
  getDomainMailboxes.mockReset().mockResolvedValue(["u@tpi-3.ca"]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseMailboxSourceParams", () => {
  const parse = (query: string) => parseMailboxSourceParams(new URLSearchParams(query));

  it("defaults to the directory and the configured domain", () => {
    expect(parse("")).toEqual({ ok: true, domain: undefined, source: "directory" });
  });

  it("reads and normalizes domain and source", () => {
    expect(parse("domain=TPI-3.ca&source=Users")).toEqual({
      ok: true,
      domain: "tpi-3.ca",
      source: "users",
    });
  });

  it("rejects a bad domain or source", () => {
    expect(parse("domain=a.com/b")).toMatchObject({ ok: false });
    expect(parse("source=google")).toMatchObject({ ok: false });
  });
});

describe("resolveDomainMailboxes", () => {
  it("asks the Directory as the admin of the requested domain", async () => {
    const out = await resolveDomainMailboxes({ domain: "tpi-3.ca", source: "directory" });

    expect(listDirectoryMailboxes).toHaveBeenCalledWith({
      domain: "tpi-3.ca",
      admin: "josh@tpi-3.ca",
    });
    expect(out).toEqual({
      domain: "tpi-3.ca",
      source: "directory",
      mailboxes: ["a@tpi-3.ca"],
      directory: { admin: "josh@tpi-3.ca", accounts: 2, skippedNoMailbox: 1 },
    });
  });

  it("uses the configured domain when none is asked for, and the other domain's admin", async () => {
    await resolveDomainMailboxes({ source: "directory" });

    expect(listDirectoryMailboxes).toHaveBeenCalledWith({
      domain: "bleacherrentals.com",
      admin: "krista@bleacherrentals.com",
    });
  });

  it("says what to set when no admin is listed for the domain", async () => {
    vi.stubEnv("GMAIL_DIRECTORY_ADMINS", "josh@tpi-3.ca");

    await expect(
      resolveDomainMailboxes({ domain: "bleacherrentals.com", source: "directory" }),
    ).rejects.toThrow(/GMAIL_DIRECTORY_ADMINS has no admin of bleacherrentals\.com/);
    expect(listDirectoryMailboxes).not.toHaveBeenCalled();
  });

  it("can read the Users table instead, without needing an admin", async () => {
    vi.stubEnv("GMAIL_DIRECTORY_ADMINS", "");

    const out = await resolveDomainMailboxes({ domain: "tpi-3.ca", source: "users" });

    expect(getDomainMailboxes).toHaveBeenCalledWith("tpi-3.ca");
    expect(out).toEqual({ domain: "tpi-3.ca", source: "users", mailboxes: ["u@tpi-3.ca"] });
    expect(listDirectoryMailboxes).not.toHaveBeenCalled();
  });
});
