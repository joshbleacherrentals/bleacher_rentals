import { afterEach, describe, expect, it, vi } from "vitest";
import { sendReply, type SendReplyPayload } from "./sendReply";

afterEach(() => {
  vi.unstubAllGlobals();
});

const payload: SendReplyPayload = {
  emailMessageUuid: "m-1",
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
  it("posts the reply, with the id of its saved row, as JSON to the send route", async () => {
    const fetchMock = respond(true, 200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendReply(payload)).resolves.toBeUndefined();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/gmail/send");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init?.body as string)).toEqual(payload);
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
