import { describe, it, expect, vi } from "vitest";
import { runSend, canDismiss, canSend } from "./sendQuoteFlow";

const ok = { ok: true } as const;

describe("runSend", () => {
  it("runs onBeforeSend, then sends, then reports sent", async () => {
    const order: string[] = [];
    const result = await runSend({
      eventId: "e1",
      recipients: ["a@x.com"],
      onBeforeSend: async () => void order.push("before"),
      post: async () => (order.push("post"), ok),
      onSent: async () => void order.push("sent"),
    });
    expect(result).toEqual(ok);
    expect(order).toEqual(["before", "post", "sent"]);
  });

  it("does not send when onBeforeSend fails, and says the quote was not sent", async () => {
    const post = vi.fn();
    const result = await runSend({
      eventId: "e1",
      recipients: ["a@x.com"],
      onBeforeSend: async () => {
        throw new Error("write failed");
      },
      post,
      onSent: vi.fn(),
    });
    expect(post).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: false, message: "Could not update the quote: write failed" });
  });

  it("names the Quoted status when the email fails after onBeforeSend", async () => {
    const result = await runSend({
      eventId: "e1",
      recipients: ["a@x.com"],
      onBeforeSend: async () => {},
      post: async () => ({ ok: false, message: "No template" }),
      onSent: vi.fn(),
    });
    expect(result).toEqual({
      ok: false,
      message: "Saved as Quoted, but the email did not send: No template",
    });
  });

  it("passes the plain server message through when there was no onBeforeSend", async () => {
    const result = await runSend({
      eventId: "e1",
      recipients: ["a@x.com"],
      post: async () => ({ ok: false, message: "No template" }),
      onSent: vi.fn(),
    });
    expect(result).toEqual({ ok: false, message: "No template" });
  });

  it("does not call onSent when the send fails", async () => {
    const onSent = vi.fn();
    await runSend({
      eventId: "e1",
      recipients: ["a@x.com"],
      post: async () => ({ ok: false, message: "x" }),
      onSent,
    });
    expect(onSent).not.toHaveBeenCalled();
  });

  it("still reports sent when the local change log write fails — the email already went out", async () => {
    const result = await runSend({
      eventId: "e1",
      recipients: ["a@x.com"],
      post: async () => ok,
      onSent: async () => {
        throw new Error("log failed");
      },
    });
    expect(result).toEqual(ok);
  });
});

describe("canDismiss", () => {
  it("blocks closing only while sending", () => {
    expect(canDismiss("sending")).toBe(false);
    expect(canDismiss("review")).toBe(true);
    expect(canDismiss("sent")).toBe(true);
    expect(canDismiss("error")).toBe(true);
  });
});

describe("canSend", () => {
  const preview = { ok: true } as const;
  it("needs a recipient and a loaded, ok preview", () => {
    expect(canSend({ recipients: ["a@x.com"], preview })).toBe(true);
    expect(canSend({ recipients: [], preview })).toBe(false);
    expect(canSend({ recipients: ["a@x.com"], preview: null })).toBe(false);
    expect(canSend({ recipients: ["a@x.com"], preview: { ok: false } })).toBe(false);
  });
});
