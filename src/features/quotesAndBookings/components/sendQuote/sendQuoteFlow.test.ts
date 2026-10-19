import { describe, it, expect, vi } from "vitest";
import { runSend, canDismiss, canSend, ignoreDialogEscape } from "./sendQuoteFlow";
import type { SendQuoteInput } from "../../utils/sendQuote";

const ok = { ok: true } as const;
const buildInput = (addedFileIds: string[] = []): SendQuoteInput => ({
  to: ["a@x.com"],
  cc: [],
  bcc: [],
  subject: "",
  removedAttachmentKeys: [],
  addedFileIds,
});

describe("runSend", () => {
  it("runs onBeforeSend, then sends, then reports sent", async () => {
    const order: string[] = [];
    const result = await runSend({
      eventId: "e1",
      buildInput,
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
      buildInput,
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
      buildInput,
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
      buildInput,
      post: async () => ({ ok: false, message: "No template" }),
      onSent: vi.fn(),
    });
    expect(result).toEqual({ ok: false, message: "No template" });
  });

  it("does not call onSent when the send fails", async () => {
    const onSent = vi.fn();
    await runSend({
      eventId: "e1",
      buildInput,
      post: async () => ({ ok: false, message: "x" }),
      onSent,
    });
    expect(onSent).not.toHaveBeenCalled();
  });

  it("still reports sent when the local change log write fails — the email already went out", async () => {
    const result = await runSend({
      eventId: "e1",
      buildInput,
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

  it("is off while a limit is exceeded, and does not depend on the subject", () => {
    expect(canSend({ recipients: ["a@x.com"], preview, withinLimits: false })).toBe(false);
    expect(canSend({ recipients: ["a@x.com"], preview, withinLimits: true })).toBe(true);
  });
});

describe("runSend with added files", () => {
  const file = (name: string) => new File(["x"], name, { type: "application/pdf" });
  const pending = [
    { id: "p1", file: file("one.pdf") },
    { id: "p2", file: file("two.pdf") },
  ];

  it("uploads every pending file first, then posts their ids, then logs the final input", async () => {
    const order: string[] = [];
    const upload = vi.fn(async (f: File) => (order.push(`up:${f.name}`), `id-${f.name}`));
    const post = vi.fn(async () => (order.push("post"), ok));
    const onSent = vi.fn(async () => void order.push("sent"));
    const result = await runSend({
      eventId: "e1",
      buildInput,
      pendingFiles: pending,
      upload,
      post,
      onSent,
    });
    expect(result).toEqual(ok);
    expect(order).toEqual(["up:one.pdf", "up:two.pdf", "post", "sent"]);
    const posted = (post.mock.calls[0] as unknown[])[1] as SendQuoteInput;
    expect(posted.addedFileIds).toEqual(["id-one.pdf", "id-two.pdf"]);
    expect(onSent).toHaveBeenCalledWith(posted);
  });

  it("uploads nothing when there are no pending files", async () => {
    const upload = vi.fn();
    await runSend({ eventId: "e1", buildInput, upload, post: async () => ok, onSent: vi.fn() });
    expect(upload).not.toHaveBeenCalled();
  });

  it("does not upload again on a retry after the send failed", async () => {
    const upload = vi.fn(async (f: File) => `id-${f.name}`);
    const uploadedIds = new Map<string, string>();
    const post = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "Postmark down" })
      .mockResolvedValueOnce(ok);
    const run = () =>
      runSend({
        eventId: "e1",
        buildInput,
        pendingFiles: pending,
        uploadedIds,
        upload,
        post,
        onSent: vi.fn(),
      });
    expect(await run()).toEqual({ ok: false, message: "Postmark down" });
    expect(await run()).toEqual(ok);
    expect(upload).toHaveBeenCalledTimes(2); // once per file, not once per attempt
    expect(post.mock.calls[1][1].addedFileIds).toEqual(["id-one.pdf", "id-two.pdf"]);
  });

  it("on a failed upload does not send, and a retry uploads only the file that is missing", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce("id-1")
      .mockRejectedValueOnce(new Error("storage full"))
      .mockResolvedValueOnce("id-2");
    const post = vi.fn(async (..._a: unknown[]) => ok);
    const uploadedIds = new Map<string, string>();
    const run = () =>
      runSend({
        eventId: "e1",
        buildInput,
        pendingFiles: pending,
        uploadedIds,
        upload,
        post,
        onSent: vi.fn(),
      });
    expect(await run()).toEqual({
      ok: false,
      message: "Could not upload two.pdf: storage full",
      stage: "upload",
    });
    expect(post).not.toHaveBeenCalled();
    expect(await run()).toEqual(ok);
    expect(upload).toHaveBeenCalledTimes(3);
    expect((post.mock.calls[0] as any[])[1].addedFileIds).toEqual(["id-1", "id-2"]);
  });

  it("does not run onBeforeSend (mark Quoted) when an upload fails", async () => {
    const onBeforeSend = vi.fn();
    await runSend({
      eventId: "e1",
      buildInput,
      pendingFiles: pending,
      upload: async () => {
        throw new Error("nope");
      },
      onBeforeSend,
      post: async () => ok,
      onSent: vi.fn(),
    });
    expect(onBeforeSend).not.toHaveBeenCalled();
  });

  it("keeps the message of a thrown PostgrestError-like object instead of 'unknown error'", async () => {
    const result = await runSend({
      eventId: "e1",
      buildInput,
      pendingFiles: pending,
      upload: async () => {
        throw { message: "new row violates row-level security policy", code: "42501" };
      },
      post: async () => ok,
      onSent: vi.fn(),
    });
    expect(result).toMatchObject({
      ok: false,
      stage: "upload",
      message: "Could not upload one.pdf: new row violates row-level security policy",
    });
  });

  it("does not mark a send failure as an upload failure", async () => {
    const result = await runSend({
      eventId: "e1",
      buildInput,
      post: async () => ({ ok: false, message: "nope" }),
      onSent: vi.fn(),
    });
    expect(result).toEqual({ ok: false, message: "nope" });
  });
});

describe("ignoreDialogEscape", () => {
  const el = (role: string | null, expanded: string | null) => ({
    getAttribute: (n: string) => (n === "role" ? role : n === "aria-expanded" ? expanded : null),
  });
  it("ignores Escape while sending", () => {
    expect(ignoreDialogEscape("sending", null)).toBe(true);
  });
  it("ignores Escape when the focused combobox has its list open (only the list closes)", () => {
    expect(ignoreDialogEscape("review", el("combobox", "true"))).toBe(true);
  });
  it("lets Escape close the dialog otherwise", () => {
    expect(ignoreDialogEscape("review", el("combobox", "false"))).toBe(false);
    expect(ignoreDialogEscape("review", el(null, null))).toBe(false);
    expect(ignoreDialogEscape("review", null)).toBe(false);
    expect(ignoreDialogEscape("error", null)).toBe(false);
  });
});
