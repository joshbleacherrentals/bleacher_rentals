import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanRecipients, postSendQuote, fetchSendPreview } from "./sendQuote";

afterEach(() => vi.unstubAllGlobals());

describe("cleanRecipients", () => {
  it("keeps valid addresses in order, trimmed and de-duplicated", () => {
    expect(cleanRecipients([" a@x.com ", "b@x.com", "a@x.com"])).toEqual(["a@x.com", "b@x.com"]);
  });

  it("drops blanks, null, undefined and values with no @", () => {
    expect(cleanRecipients([null, undefined, "", "Jane Doe", "c@x.com"])).toEqual(["c@x.com"]);
  });

  it("is case-insensitive when de-duplicating, keeping the first spelling", () => {
    expect(cleanRecipients(["A@x.com", "a@X.com"])).toEqual(["A@x.com"]);
  });
});

describe("postSendQuote", () => {
  const stub = (impl: () => unknown) => vi.stubGlobal("fetch", vi.fn(impl));

  it("posts the recipients to the send route and reports success", async () => {
    stub(async () => ({ ok: true, json: async () => ({ success: true }) }));
    expect(await postSendQuote("evt-1", ["a@x.com"])).toEqual({ ok: true });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("/api/quotes/evt-1/send");
    expect(JSON.parse(init.body)).toEqual({ recipientEmails: ["a@x.com"] });
  });

  it("returns the server's message on a non-ok response", async () => {
    stub(async () => ({ ok: false, status: 500, json: async () => ({ error: "No template" }) }));
    expect(await postSendQuote("evt-1", ["a@x.com"])).toEqual({
      ok: false,
      message: "No template",
    });
  });

  it("falls back to the status when the error body is unreadable", async () => {
    stub(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("bad json");
      },
    }));
    expect(await postSendQuote("evt-1", ["a@x.com"])).toEqual({
      ok: false,
      message: "Failed (502)",
    });
  });

  it("asks the person to sign in again on a 401", async () => {
    stub(async () => ({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) }));
    const result = await postSendQuote("evt-1", ["a@x.com"]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/sign in again/i);
  });

  it("reports a network failure instead of throwing", async () => {
    stub(async () => {
      throw new Error("offline");
    });
    expect(await postSendQuote("evt-1", ["a@x.com"])).toEqual({ ok: false, message: "offline" });
  });
});

describe("fetchSendPreview", () => {
  it("requests the preview with the recipients encoded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, subject: "S" }) })),
    );
    await fetchSendPreview("evt-1", ["a@x.com", "b@x.com"]);
    expect((fetch as any).mock.calls[0][0]).toBe(
      "/api/quotes/evt-1/send-preview?recipients=a%40x.com%2Cb%40x.com",
    );
  });

  it("turns a failed request into a reason so Send stays disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    expect(await fetchSendPreview("evt-1", ["a@x.com"])).toEqual({
      ok: false,
      reason: "Could not load the email preview (500).",
    });
  });

  it("turns a network failure into a reason", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await fetchSendPreview("evt-1", ["a@x.com"])).toEqual({ ok: false, reason: "offline" });
  });
});
