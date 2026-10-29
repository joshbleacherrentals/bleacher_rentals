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

vi.mock("@/utils/supabase/server", () => ({
  createServiceRoleClient: async () => ({ fake: "admin" }),
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
vi.mock("@/features/gmail-integration/server/gmailMessages", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/gmail-integration/server/gmailMessages")>()),
  sendRawMessage: (...args: unknown[]) => sendRawMessage(...args),
}));

const readEmailContent = vi.fn();
vi.mock("@/features/gmail-integration/server/emailContent", () => ({
  readEmailContent: (...args: unknown[]) => readEmailContent(...args),
}));

import { GmailApiError } from "@/features/gmail-integration/server/gmailMessages";
import { NOT_COMPANY_EMAIL_MESSAGE } from "@/features/userAccess/logic/canSendEmail";
import { POST } from "./route";

const valid = {
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
  // The email as Gmail hands it back (format=full), and the body read out of it.
  readEmailContent.mockResolvedValue({
    message: {
      id: "sent1",
      threadId: "t-sent",
      snippet: "Sounds good.",
      internalDate: "1761494400000",
      labelIds: ["SENT"],
      payload: {
        headers: [
          { name: "Message-ID", value: "<sent@co.com>" },
          { name: "In-Reply-To", value: "<b@x>" },
          { name: "References", value: "<a@x> <b@x>" },
          { name: "From", value: "Josh Redgrift <josh@bleacherrentals.com>" },
          { name: "To", value: "pat@xyz.com" },
          { name: "Cc", value: "sam@xyz.com" },
          { name: "Subject", value: "Re: Quote" },
          { name: "Date", value: "Mon, 26 Oct 2026 10:00:00 -0600" },
        ],
      },
    },
    content: { text: "Sounds good.", html: null },
  });
});

describe("POST /api/gmail/send", () => {
  it("refuses someone who may not send, before anything else happens", async () => {
    requireEmailSender.mockRejectedValue(
      new Response(JSON.stringify({ error: "You can't send emails with your permission level." }), {
        status: 403,
      }),
    );

    const res = await post(valid);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/permission level/i);
    expect(guardEmailRecipients).not.toHaveBeenCalled();
    expect(getDelegatedAccessToken).not.toHaveBeenCalled();
    expect(sendRawMessage).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON, or not a valid request, without asking Google anything", async () => {
    const notJson = await post("{nope");
    const noRecipient = await post({ ...valid, to: [], cc: [], bcc: [] });
    const badAddress = await post({ ...valid, to: ["not-an-email"] });

    expect(notJson.status).toBe(400);
    expect(noRecipient.status).toBe(400);
    expect((await noRecipient.json()).error).toMatch(/recipient/i);
    expect(badAddress.status).toBe(400);
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

  it("refuses the whole send when the development guard blocks an address, naming it", async () => {
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
  });

  it("checks every recipient, To, Cc and Bcc, with the development guard", async () => {
    await post({ ...valid, to: ["a@x.com", "b@x.com"], cc: ["c@x.com"], bcc: ["d@x.com"] });

    expect(guardEmailRecipients).toHaveBeenCalledWith(
      { fake: "admin" },
      { to: "a@x.com, b@x.com", cc: "c@x.com", bcc: "d@x.com" },
    );
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

  it("returns the sent email in the form the contact page saves, with its body", async () => {
    const res = await post(valid);

    expect(res.status).toBe(200);
    // One read, with the token that sent it, gives both the summary and the body.
    expect(readEmailContent).toHaveBeenCalledTimes(1);
    expect(readEmailContent).toHaveBeenCalledWith("ya29.token", "sent1");
    const { message, details } = await res.json();
    expect(message).toMatchObject({
      messageId: "<sent@co.com>",
      inReplyTo: "<b@x>",
      subject: "Re: Quote",
      snippet: "Sounds good.",
      direction: "sent",
      copies: [{ mailbox: "josh@bleacherrentals.com", id: "sent1", threadId: "t-sent" }],
    });
    expect(details).toEqual({ text: "Sounds good.", html: null });
  });

  it("puts the reply in the thread only when the thread is the sender's own mailbox's", async () => {
    await post({ ...valid, thread: { mailbox: "Josh@BleacherRentals.com", threadId: "19abc" } });
    await post({ ...valid, thread: { mailbox: "paul@co.com", threadId: "19abc" } });

    expect(sendRawMessage.mock.calls[0][2]).toBe("19abc");
    expect(sendRawMessage.mock.calls[1][2]).toBeUndefined();
  });

  it("tells the user plainly when Google will not give a token for the sender, and sends nothing", async () => {
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
    consoleError.mockRestore();
  });

  it("reports Gmail's refusal", async () => {
    sendRawMessage.mockRejectedValue(new GmailApiError(400, "Invalid To header"));

    const res = await post(valid);

    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Invalid To header");
  });

  it("still reports the send as done when the sent email cannot be read back", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    readEmailContent.mockRejectedValue(new GmailApiError(500, "backend error"));

    const res = await post(valid);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: null, details: null });
    consoleError.mockRestore();
  });
});
