import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/supabase/server", () => ({ createServiceRoleClient: vi.fn() }));

const getDelegatedAccessToken = vi.fn();
vi.mock("./delegatedAuth", () => ({
  getDelegatedAccessToken: (args: unknown) => getDelegatedAccessToken(args),
}));

import {
  DIRECTORY_USER_READONLY_SCOPE,
  directoryAdminFor,
  listDirectoryMailboxes,
  parseDirectoryAdmins,
  pickDirectoryMailboxes,
} from "./directory";

beforeEach(() => {
  getDelegatedAccessToken.mockReset().mockResolvedValue("ya29.admin-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseDirectoryAdmins / directoryAdminFor", () => {
  it("parses a comma list, trimming, lowercasing and removing repeats", () => {
    expect(parseDirectoryAdmins(" A@x.com, b@y.org ,a@x.com,, ")).toEqual(["a@x.com", "b@y.org"]);
    expect(parseDirectoryAdmins(undefined)).toEqual([]);
  });

  it("picks the admin who is on the requested domain", () => {
    const admins = ["josh@tpi-3.ca", "krista@bleacherrentals.com"];

    expect(directoryAdminFor("tpi-3.ca", admins)).toBe("josh@tpi-3.ca");
    expect(directoryAdminFor("bleacherrentals.com", admins)).toBe("krista@bleacherrentals.com");
    expect(directoryAdminFor("other.com", admins)).toBeNull();
  });
});

describe("pickDirectoryMailboxes", () => {
  it("keeps suspended and archived accounts but leaves out accounts with no mailbox", () => {
    const out = pickDirectoryMailboxes(
      [
        { primaryEmail: "pat@co.com", isMailboxSetup: true },
        { primaryEmail: "gone@co.com", suspended: true },
        { primaryEmail: "old@co.com", archived: true },
        { primaryEmail: "nomail@co.com", isMailboxSetup: false },
        { primaryEmail: "Pat@CO.com" },
        {},
      ],
      "co.com",
    );

    expect(out.mailboxes).toEqual(["gone@co.com", "old@co.com", "pat@co.com"]);
    expect(out.skippedNoMailbox).toBe(1);
  });
});

describe("listDirectoryMailboxes", () => {
  const page = (body: object, ok = true, status = 200) => ({
    ok,
    status,
    statusText: "x",
    json: async () => body,
  });

  it("acts as the admin with the directory scope and asks for the domain's users", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      page({ users: [{ primaryEmail: "pat@co.com" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await listDirectoryMailboxes({ domain: "co.com", admin: "boss@co.com" });

    expect(getDelegatedAccessToken).toHaveBeenCalledWith({
      subject: "boss@co.com",
      scopes: [DIRECTORY_USER_READONLY_SCOPE],
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://admin.googleapis.com/admin/directory/v1/users");
    expect(url.searchParams.get("domain")).toBe("co.com");
    expect(url.searchParams.get("maxResults")).toBe("500");
    expect(fetchMock.mock.calls[0][1]).toEqual({
      headers: { Authorization: "Bearer ya29.admin-token" },
    });
    expect(out).toEqual({ mailboxes: ["pat@co.com"], accounts: 1, skippedNoMailbox: 0 });
  });

  it("follows page tokens until there are no more", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page({ users: [{ primaryEmail: "a@co.com" }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(page({ users: [{ primaryEmail: "b@co.com" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await listDirectoryMailboxes({ domain: "co.com", admin: "boss@co.com" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("pageToken")).toBe("p2");
    expect(out.mailboxes).toEqual(["a@co.com", "b@co.com"]);
  });

  it("explains what to set up when Google refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        page({ error: { message: "Not Authorized to access this resource/api" } }, false, 403),
      ),
    );

    await expect(
      listDirectoryMailboxes({ domain: "co.com", admin: "boss@co.com" }),
    ).rejects.toThrow(/Directory API 403: Not Authorized[\s\S]*Admin SDK API[\s\S]*boss@co\.com/);
  });

  it("returns an empty list for a domain with no accounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => page({})),
    );

    expect(await listDirectoryMailboxes({ domain: "co.com", admin: "boss@co.com" })).toEqual({
      mailboxes: [],
      accounts: 0,
      skippedNoMailbox: 0,
    });
  });
});
