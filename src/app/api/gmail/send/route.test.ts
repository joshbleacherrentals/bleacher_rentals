import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const requireEmailSender = vi.fn();
vi.mock("@/features/userAccess/logic/requireEmailSender", () => ({
  requireEmailSender: () => requireEmailSender(),
}));

let userResult: { data: unknown; error: unknown };
vi.mock("@/utils/supabase/getClerkSupabaseServerClient", () => ({
  createServerSupabaseClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => userResult }) }) }),
  }),
}));

const admin = { fake: "admin" };
vi.mock("@/utils/supabase/server", () => ({
  createServiceRoleClient: async () => admin,
}));

const guardEmailRecipients = vi.fn();
vi.mock("@/features/devEmailAllowlist/server/guardRecipients", () => ({
  guardEmailRecipients: (...args: unknown[]) => guardEmailRecipients(...args),
}));

const getDelegatedAccessToken = vi.fn();
vi.mock("@/features/gmail-integration/server/delegatedAuth", () => ({
  GMAIL_READONLY_SCOPE: "scope-read",
  GMAIL_SEND_SCOPE: "scope-send",
  getDelegatedAccessToken: (...args: unknown[]) => getDelegatedAccessToken(...args),
}));

const sendRawMessage = vi.fn();
const getMessageSummary = vi.fn();
vi.mock("@/features/gmail-integration/server/gmailMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gmail-integration/server/gmailMessages")>()),
  sendRawMessage: (...args: unknown[]) => sendRawMessage(...args),
  getMessageSummary: (...args: unknown[]) => getMessageSummary(...args),
}));

// The database half is tested in unsentEmail.test.ts; here only the calls the route makes to it.
const findEmailRow = vi.fn();
const recordSentEmail = vi.fn();
const recordFailedEmail = vi.fn();
vi.mock("@/features/gmail-integration/server/unsentEmail", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gmail-integration/server/unsentEmail")>()),
  findEmailRow: (...args: unknown[]) => findEmailRow(...args),
  recordSentEmail: (...args: unknown[]) => recordSentEmail(...args),
  recordFailedEmail: (...args: unknown[]) => recordFailedEmail(...args),
}));

import { GmailApiError } from "@/features/gmail-integration/server/gmailMessages";
import { NOT_COMPANY_EMAIL_MESSAGE } from "@/features/userAccess/logic/canSendEmail";
import { POST } from "./route";

const EMAIL_ID = "9b2f6c1e-3d4a-4f5b-8c7d-1e2f3a4b5c6d";

const valid = {
  emailMessageUuid: EMAIL_ID,
  to: ["pat@xyz.com"],
  cc: ["sam@xyz.com"],
  bcc: [],
  subject: "Re: Quote",
  text: "Sounds good.",
  inReplyTo: "<b@x>",
  references: "<a@x> <b@x>",
  thread: null,
};

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/gmail/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const decode = (raw: string) => Buffer.from(raw, "base64url").toString("utf8");

const pendingRow = {
  id: EMAIL_ID,
  mailbox: "josh@bleacherrentals.com",
  direction: "sent",
  status: "sending",
  google_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireEmailSender.mockResolvedValue("user_clerk");
  userResult = {
    data: { email: "Josh@BleacherRentals.com", first_name: "Josh", last_name: "Redgrift" },
    error: null,
  };
  guardEmailRecipients.mockResolvedValue({ to: "pat@xyz.com", cc: null, bcc: null, blocked: [] });
  getDelegatedAccessToken.mockResolvedValue("ya29.token");
  sendRawMessage.mockResolvedValue({ id: "sent1", threadId: "t-sent", labelIds: ["SENT"] });
  getMessageSummary.mockResolvedValue({
    id: "sent1",
    threadId: "t-sent",
    messageId: "<sent@co.com>",
    inReplyTo: "<b@x>",
    references: "<a@x> <b@x>",
    from: "Josh Redgrift <josh@bleacherrentals.com>",
    to: "pat@xyz.com",
    cc: "sam@xyz.com",
    subject: "Re: Quote",
    date: "Mon, 26 Oct 2026 10:00:00 -0600",
    snippet: "Sounds good.",
    internalDate: 1761494400000,
    labelIds: ["SENT"],
  });
  findEmailRow.mockResolvedValue(pendingRow);
  recordSentEmail.mockResolvedValue("updated");
  recordFailedEmail.mockResolvedValue(undefined);
});

describe("POST /api/gmail/send", () => {
  it("refuses someone who may not send, before anything else happens", async () => {
    requireEmailSender.mockRejectedValue(
      new Response(JSON.stringify({ error: "You don't have permission to send emails." }), {
        status: 403,
      }),
    );

    const res = await post(valid);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/permission/i);
    expect(guardEmailRecipients).not.toHaveBeenCalled();
    expect(getDelegatedAccessToken).not.toHaveBeenCalled();
    expect(sendRawMessage).not.toHaveBeenCalled();
    expect(recordFailedEmail).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON, or not a valid request, without asking Google anything", async () => {
    const notJson = await post("{nope");
    const noRecipient = await post({ ...valid, to: [], cc: [], bcc: [] });
    const badAddress = await post({ ...valid, to: ["not-an-email"] });
    const noEmailId = await post({ ...valid, emailMessageUuid: "nope" });

    expect(notJson.status).toBe(400);
    expect(noRecipient.status).toBe(400);
    expect((await noRecipient.json()).error).toMatch(/recipient/i);
    expect(badAddress.status).toBe(400);
    expect(noEmailId.status).toBe(400);
    expect(getDelegatedAccessToken).not.toHaveBeenCalled();
    expect(sendRawMessage).not.toHaveBeenCalled();
  });

  it("will not send for an account that has no email address", async () => {
    userResult = { data: { email: null, first_name: "Josh", last_name: null }, error: null };

    const res = await post(valid);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no email address/i);
    expect(sendRawMessage).not.toHaveBeenCalled();
  });

  it("refuses an account that is not on the company domain, before asking Google anything", async () => {
    for (const email of ["redgriftjosh@gmail.com", "josh@example.com"]) {
      userResult = { data: { email, first_name: "Josh", last_name: null }, error: null };

      const res = await post(valid);

      expect(res.status, email).toBe(403);
      const { error } = await res.json();
      expect(error).toBe(NOT_COMPANY_EMAIL_MESSAGE);
      expect(error).not.toMatch(/domain-wide|unauthorized_client/i);
    }
    expect(guardEmailRecipients).not.toHaveBeenCalled();
    expect(getDelegatedAccessToken).not.toHaveBeenCalled();
    expect(sendRawMessage).not.toHaveBeenCalled();
  });

  it("refuses a request for an email that was already sent, or is not the sender's, and sends nothing", async () => {
    for (const row of [
      { ...pendingRow, status: "success", google_id: "18c0ffee" },
      { ...pendingRow, mailbox: "mike@bleacherrentals.com" },
    ]) {
      findEmailRow.mockResolvedValue(row);

      const res = await post(valid);

      expect(res.status).toBe(409);
      expect(sendRawMessage).not.toHaveBeenCalled();
      // It is not this request's email to mark failed.
      expect(recordFailedEmail).not.toHaveBeenCalled();
    }
  });

  it("goes ahead when the saved email has not been uploaded yet, and looks for it afterwards", async () => {
    findEmailRow.mockResolvedValue(null);

    const res = await post(valid);

    expect(res.status).toBe(200);
    expect(sendRawMessage).toHaveBeenCalledTimes(1);
    expect(recordSentEmail).toHaveBeenCalledTimes(1);
  });

  it("refuses the whole send when the development guard blocks an address, naming it, and marks the email failed", async () => {
    guardEmailRecipients.mockResolvedValue({
      to: "pat@xyz.com",
      cc: null,
      bcc: null,
      blocked: ["sam@xyz.com"],
    });

    const res = await post(valid);

    expect(res.status).toBe(403);
    const { error } = await res.json();
    expect(error).toMatch(/cannot send to external emails in development/i);
    expect(error).toContain("sam@xyz.com");
    expect(error).toContain("/dev-tools/allowed-emails");
    expect(getDelegatedAccessToken).not.toHaveBeenCalled();
    expect(sendRawMessage).not.toHaveBeenCalled();
    expect(recordFailedEmail).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({
        id: EMAIL_ID,
        sender: "josh@bleacherrentals.com",
        reason: error,
      }),
    );
  });

  it("checks every recipient, To, Cc and Bcc, with the development guard", async () => {
    await post({ ...valid, to: ["a@x.com", "b@x.com"], cc: ["c@x.com"], bcc: ["d@x.com"] });

    expect(guardEmailRecipients).toHaveBeenCalledWith(admin, {
      to: "a@x.com, b@x.com",
      cc: "c@x.com",
      bcc: "d@x.com",
    });
  });

  it("sends as the signed-in user, never as anyone named in the request", async () => {
    const res = await post({ ...valid, from: "ceo@co.com", sender: "ceo@co.com" });

    expect(res.status).toBe(200);
    expect(getDelegatedAccessToken).toHaveBeenCalledWith({
      subject: "josh@bleacherrentals.com",
      scopes: ["scope-send", "scope-read"],
    });
    const [token, raw, threadId] = sendRawMessage.mock.calls[0];
    expect(token).toBe("ya29.token");
    expect(threadId).toBeUndefined();
    const message = decode(raw);
    expect(message).toContain('From: "Josh Redgrift" <josh@bleacherrentals.com>');
    expect(message).toContain("To: pat@xyz.com");
    expect(message).toContain("Cc: sam@xyz.com");
    expect(message).toContain("In-Reply-To: <b@x>");
    expect(message).toContain("References: <a@x> <b@x>");
    expect(message).not.toContain("ceo@co.com");
  });

  it("updates the saved email with what Gmail says instead of creating one", async () => {
    const res = await post(valid);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(getMessageSummary).toHaveBeenCalledWith("ya29.token", "sent1");
    expect(recordSentEmail).toHaveBeenCalledTimes(1);
    const [client, params] = recordSentEmail.mock.calls[0];
    expect(client).toBe(admin);
    expect(params).toMatchObject({ id: EMAIL_ID, sender: "josh@bleacherrentals.com" });
    expect(params.columns).toMatchObject({
      google_message_id: "<sent@co.com>",
      google_id: "sent1",
      google_thread_id: "t-sent",
      google_in_reply_to: "<b@x>",
      subject: "Re: Quote",
      snippet: "Sounds good.",
    });
    expect(recordFailedEmail).not.toHaveBeenCalled();
  });

  it("puts the reply in the thread only when the thread is the sender's own mailbox's", async () => {
    await post({ ...valid, thread: { mailbox: "Josh@BleacherRentals.com", threadId: "19abc" } });
    await post({ ...valid, thread: { mailbox: "paul@co.com", threadId: "19abc" } });

    expect(sendRawMessage.mock.calls[0][2]).toBe("19abc");
    expect(sendRawMessage.mock.calls[1][2]).toBeUndefined();
  });

  it("tells the user plainly when Google will not give a token for the sender, sends nothing, and marks the email failed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getDelegatedAccessToken.mockRejectedValue(
      new Error("Google refused the delegated token request: unauthorized_client (details)."),
    );

    const res = await post(valid);

    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toContain("josh@bleacherrentals.com");
    expect(error).toMatch(/ask a developer/i);
    // Google's own wording is for the log, not for the person sending.
    expect(error).not.toMatch(/unauthorized_client|domain-wide|admin console/i);
    expect(consoleError).toHaveBeenCalled();
    expect(sendRawMessage).not.toHaveBeenCalled();
    expect(recordFailedEmail).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ id: EMAIL_ID, reason: error }),
    );
    consoleError.mockRestore();
  });

  it("reports Gmail's refusal and marks the email failed with it", async () => {
    sendRawMessage.mockRejectedValue(new GmailApiError(400, "Invalid To header"));

    const res = await post(valid);

    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toContain("Invalid To header");
    expect(recordFailedEmail).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ id: EMAIL_ID, sender: "josh@bleacherrentals.com", reason: error }),
    );
    expect(recordSentEmail).not.toHaveBeenCalled();
  });

  it("still answers with the reason when the failed email cannot be marked", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendRawMessage.mockRejectedValue(new GmailApiError(400, "Invalid To header"));
    recordFailedEmail.mockRejectedValue(new Error("database is down"));

    const res = await post(valid);

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Invalid To header");
    consoleError.mockRestore();
  });

  it("still fills in the saved email's Google ids when the sent email cannot be read back", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    getMessageSummary.mockRejectedValue(new GmailApiError(500, "backend error"));

    const res = await post(valid);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: true });
    expect(recordSentEmail.mock.calls[0][1].columns).toEqual({
      google_id: "sent1",
      google_thread_id: "t-sent",
    });
    consoleError.mockRestore();
  });

  it("says the row was not updated when it could not be found, but never calls a sent email failed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    recordSentEmail.mockResolvedValue("missing");

    const res = await post(valid);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
    expect(recordFailedEmail).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("still reports the send as done when the row cannot be updated, and never marks it failed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    recordSentEmail.mockRejectedValue(new Error("database is down"));

    const res = await post(valid);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, recorded: false });
    expect(recordFailedEmail).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
