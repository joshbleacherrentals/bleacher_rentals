import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const requireContactEmailReader = vi.fn();
vi.mock("@/features/userAccess/logic/requireContactEmailAccess", () => ({
  requireContactEmailReader: () => requireContactEmailReader(),
}));

vi.mock("@/utils/supabase/server", () => ({
  createServiceRoleClient: async () => ({ fake: "supabase" }),
}));

const isSavedContactEmail = vi.fn();
vi.mock("@/features/gmail-integration/server/savedContactEmail", () => ({
  isSavedContactEmail: (...args: unknown[]) => isSavedContactEmail(...args),
}));

const getEmailContent = vi.fn();
vi.mock("@/features/gmail-integration/server/emailContent", () => ({
  getEmailContent: (...args: unknown[]) => getEmailContent(...args),
}));

import { GmailApiError } from "@/features/gmail-integration/server/gmailMessages";
import { GET } from "./route";

const call = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/api/gmail/email?${query}`));

const VALID = "mailbox=Paul@BleacherRentals.com&id=1a15f4ce83c6ef44";

beforeEach(() => {
  vi.clearAllMocks();
  requireContactEmailReader.mockResolvedValue("clerk_1");
  isSavedContactEmail.mockResolvedValue(true);
  getEmailContent.mockResolvedValue({ text: "hello", html: null });
});

describe("GET /api/gmail/email", () => {
  it("reads a saved contact email as its mailbox, with the mailbox in lowercase", async () => {
    const res = await call(VALID);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mailbox: "paul@bleacherrentals.com", text: "hello" });
    expect(isSavedContactEmail).toHaveBeenCalledWith(expect.anything(), {
      mailbox: "paul@bleacherrentals.com",
      googleId: "1a15f4ce83c6ef44",
    });
    expect(getEmailContent).toHaveBeenCalledWith({
      mailbox: "paul@bleacherrentals.com",
      id: "1a15f4ce83c6ef44",
    });
  });

  it("is refused to someone who may not open contact emails, before anything is looked up", async () => {
    requireContactEmailReader.mockRejectedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );

    const res = await call(VALID);

    expect(res.status).toBe(403);
    expect(isSavedContactEmail).not.toHaveBeenCalled();
    expect(getEmailContent).not.toHaveBeenCalled();
  });

  it("does not ask Google about an email that is not saved on a contact", async () => {
    isSavedContactEmail.mockResolvedValue(false);

    const res = await call(VALID);

    expect(res.status).toBe(404);
    expect(getEmailContent).not.toHaveBeenCalled();
  });

  it("refuses a mailbox or id that is not well formed, before looking anything up", async () => {
    for (const query of [
      "id=1a15f4ce83c6ef44",
      "mailbox=not-an-address&id=1a15f4ce83c6ef44",
      "mailbox=paul@bleacherrentals.com",
      "mailbox=paul@bleacherrentals.com&id=../../etc",
    ]) {
      expect((await call(query)).status).toBe(400);
    }
    expect(isSavedContactEmail).not.toHaveBeenCalled();
  });

  it("answers 404 when Gmail has no email with that id in the mailbox", async () => {
    getEmailContent.mockRejectedValue(new GmailApiError(404, "Requested entity was not found."));

    const res = await call(VALID);

    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("no email with that id");
  });

  it("answers 500 for any other failure", async () => {
    getEmailContent.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await call(VALID);

    expect(res.status).toBe(500);
  });
});
