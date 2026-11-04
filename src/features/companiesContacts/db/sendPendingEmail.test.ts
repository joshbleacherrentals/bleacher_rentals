import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SendReplyPayload } from "./sendReply";

const sendReply = vi.fn();
vi.mock("./sendReply", () => ({ sendReply: (...args: unknown[]) => sendReply(...args) }));

const markEmailFailed = vi.fn();
vi.mock("./unsentEmail", () => ({
  markEmailFailed: (...args: unknown[]) => markEmailFailed(...args),
}));

import { sendPendingEmail } from "./sendPendingEmail";

const payload: SendReplyPayload = {
  emailMessageUuid: "m-1",
  to: ["pat@xyz.com"],
  cc: [],
  bcc: [],
  subject: "Re: Quote",
  text: "Sounds good.",
  inReplyTo: null,
  references: null,
  thread: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  sendReply.mockResolvedValue(undefined);
  markEmailFailed.mockResolvedValue(undefined);
});

describe("sendPendingEmail", () => {
  it("sends the reply and leaves the email alone when it works", async () => {
    expect(await sendPendingEmail(payload)).toEqual({ ok: true });

    expect(sendReply).toHaveBeenCalledWith(payload);
    expect(markEmailFailed).not.toHaveBeenCalled();
  });

  it("marks the email failed with the server's reason, and hands the reason back", async () => {
    sendReply.mockRejectedValue(new Error("You cannot send to external emails in development."));

    const result = await sendPendingEmail(payload);

    expect(result).toEqual({
      ok: false,
      message: "You cannot send to external emails in development.",
    });
    expect(markEmailFailed).toHaveBeenCalledWith(
      "m-1",
      "You cannot send to external emails in development.",
    );
  });

  it("still hands the reason back when the email cannot be marked, and never throws", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    sendReply.mockRejectedValue(new Error("Could not reach the server."));
    markEmailFailed.mockRejectedValue(new Error("database is closed"));

    await expect(sendPendingEmail(payload)).resolves.toEqual({
      ok: false,
      message: "Could not reach the server.",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
