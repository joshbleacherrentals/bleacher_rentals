import { afterEach, describe, expect, it, vi } from "vitest";
import { sendReply, type SendReplyPayload } from "./sendReply";

afterEach(() => {
  vi.unstubAllGlobals();
});

const payload: SendReplyPayload = {
  to: ["pat@xyz.com"],
  cc: [],
  bcc: [],
  subject: "Re: Quote",
  text: "Sounds good.",
  inReplyTo: "<b@x>",
  references: "<a@x> <b@x>",
  thread: null,
};

const respond = (ok: boolean, status: number, body: unknown) =>
  vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok,
    status,
    json: async () => body,
  }));

describe("sendReply", () => {
  it("posts the reply as JSON to the send route and returns the sent email with its body", async () => {
    const message = { messageId: "<sent@co.com>", direction: "sent" };
    const details = { text: "Sounds good.", html: null };
    const fetchMock = respond(true, 200, { message, details });
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendReply(payload);

    expect(sent).toEqual({ message, details });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gmail/send");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual(payload);
  });

  it("returns nothing to save when the server sent it but could not read it back", async () => {
    vi.stubGlobal("fetch", respond(true, 200, { message: null, details: null }));

    expect(await sendReply(payload)).toEqual({ message: null, details: null });
  });

  it("copes with a server that sends no body", async () => {
    const message = { messageId: "<sent@co.com>", direction: "sent" };
    vi.stubGlobal("fetch", respond(true, 200, { message }));

    expect(await sendReply(payload)).toEqual({ message, details: null });
  });

  it("throws with the server's own explanation when it refuses", async () => {
    vi.stubGlobal(
      "fetch",
      respond(false, 403, { error: "You cannot send to external emails in development: a@b.com." }),
    );

    await expect(sendReply(payload)).rejects.toThrow(
      "You cannot send to external emails in development: a@b.com.",
    );
  });

  it("throws a plain message when the server gave none", async () => {
    vi.stubGlobal("fetch", respond(false, 500, null));

    await expect(sendReply(payload)).rejects.toThrow("Could not send the reply (500).");
  });

  it("says the reply was not sent when the server cannot be reached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(sendReply(payload)).rejects.toThrow(/not sent/i);
  });
});
