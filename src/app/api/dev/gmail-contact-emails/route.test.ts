import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const requireAdmin = vi.fn();
vi.mock("@/features/userAccess/logic/requireAdmin", () => ({
  requireAdmin: () => requireAdmin(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createServiceRoleClient: async () => ({ fake: "supabase" }),
}));

const checkBlockedCustomerEmail = vi.fn();
vi.mock("@/features/gmail-integration/server/blockedEmails", () => ({
  checkBlockedCustomerEmail: (...args: unknown[]) => checkBlockedCustomerEmail(...args),
}));

const resolveDomainMailboxes = vi.fn();
vi.mock("@/features/gmail-integration/server/domainMailboxes", () => ({
  parseMailboxSourceParams: () => ({ ok: true }),
  resolveDomainMailboxes: (...args: unknown[]) => resolveDomainMailboxes(...args),
}));

const pullContactEmails = vi.fn();
vi.mock("@/features/gmail-integration/server/contactEmails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gmail-integration/server/contactEmails")>()),
  pullContactEmails: (...args: unknown[]) => pullContactEmails(...args),
}));

import { GET } from "./route";

const call = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/api/dev/gmail-contact-emails?${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(undefined);
  resolveDomainMailboxes.mockResolvedValue({
    domain: "bleacherrentals.com",
    mailboxes: ["a@b.com"],
  });
  pullContactEmails.mockResolvedValue({ messages: [], mailboxes: [] });
});

describe("GET /api/dev/gmail-contact-emails", () => {
  it("refuses a listed address before anything is asked of Google", async () => {
    checkBlockedCustomerEmail.mockResolvedValue({ status: "blocked", reason: "listed" });

    const res = await call("email=pat@xyz.com");

    expect(res.status).toBe(403);
    expect((await res.json()).error).toContain("Blocked Emails list");
    expect(checkBlockedCustomerEmail).toHaveBeenCalledWith(expect.anything(), "pat@xyz.com");
    expect(resolveDomainMailboxes).not.toHaveBeenCalled();
    expect(pullContactEmails).not.toHaveBeenCalled();
  });

  it("refuses a company address, naming the domain, before anything is asked of Google", async () => {
    checkBlockedCustomerEmail.mockResolvedValue({
      status: "blocked",
      reason: "company-domain",
      domain: "bleacherrentals.com",
    });

    const res = await call("email=mike@bleacherrentals.com");

    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error).toContain("mike@bleacherrentals.com");
    expect(error).toContain("bleacherrentals.com");
    expect(resolveDomainMailboxes).not.toHaveBeenCalled();
    expect(pullContactEmails).not.toHaveBeenCalled();
  });

  it("searches nothing when the blocked list cannot be read", async () => {
    checkBlockedCustomerEmail.mockResolvedValue({ status: "unreadable", message: "db down" });

    const res = await call("email=customer@xyz.com");

    expect(res.status).toBe(500);
    expect(resolveDomainMailboxes).not.toHaveBeenCalled();
    expect(pullContactEmails).not.toHaveBeenCalled();
  });

  it("searches every mailbox for an address that is not blocked", async () => {
    checkBlockedCustomerEmail.mockResolvedValue({ status: "allowed" });

    const res = await call("email=customer@xyz.com");

    expect(res.status).toBe(200);
    expect(pullContactEmails).toHaveBeenCalledWith(
      expect.objectContaining({ address: "customer@xyz.com", mailboxes: ["a@b.com"] }),
    );
  });

  it("does not look at the list for a request that is not a plain address", async () => {
    const res = await call("email=not-an-email");

    expect(res.status).toBe(400);
    expect(checkBlockedCustomerEmail).not.toHaveBeenCalled();
  });
});
