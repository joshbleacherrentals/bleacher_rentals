import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cleanRecipients,
  postSendQuote,
  fetchSendPreview,
  isValidEmail,
  splitAddressText,
  dedupeAddresses,
  findAddressField,
  addAddress,
  buildSendQuoteInput,
  checkSendLimits,
  formatRecipientsLine,
  MAX_RECIPIENTS,
  MAX_TOTAL_ATTACHMENT_BYTES,
  QUOTE_PDF_ESTIMATE_BYTES,
  type SendQuoteInput,
} from "./sendQuote";

const INPUT: SendQuoteInput = {
  to: ["a@x.com"],
  cc: ["c@x.com"],
  bcc: [],
  subject: "S",
  removedAttachmentKeys: ["k1"],
  addedFiles: [
    {
      id: "f1",
      storagePath: "e/f1.pdf",
      name: "f1.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1,
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("cleanRecipients", () => {
  it("keeps valid addresses in order, trimmed and de-duplicated", () => {
    expect(cleanRecipients([" a@x.com ", "b@x.com", "a@x.com"])).toEqual(["a@x.com", "b@x.com"]);
  });

  it("drops blanks, null, undefined and values with no @", () => {
    expect(cleanRecipients([null, undefined, "", "Jane Doe", "c@x.com"])).toEqual(["c@x.com"]);
  });

  it("drops an address isValidEmail refuses, so it is never prefilled into To", () => {
    expect(cleanRecipients(["a@b", "a..b@x.com", "ok@x.com"])).toEqual(["ok@x.com"]);
    expect(cleanRecipients(["a@b"])).toEqual([]);
  });

  it("is case-insensitive when de-duplicating, keeping the first spelling", () => {
    expect(cleanRecipients(["A@x.com", "a@X.com"])).toEqual(["A@x.com"]);
  });
});

describe("postSendQuote", () => {
  const stub = (impl: () => unknown) => vi.stubGlobal("fetch", vi.fn(impl));

  it("posts the recipients to the send route and reports success", async () => {
    stub(async () => ({ ok: true, json: async () => ({ success: true }) }));
    expect(await postSendQuote("evt-1", INPUT)).toEqual({ ok: true });
    const [url, init] = (fetch as any).mock.calls[0];
    expect(url).toBe("/api/quotes/evt-1/send");
    expect(JSON.parse(init.body)).toEqual(INPUT);
  });

  it("returns the server's message on a non-ok response", async () => {
    stub(async () => ({ ok: false, status: 500, json: async () => ({ error: "No template" }) }));
    expect(await postSendQuote("evt-1", INPUT)).toEqual({
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
    expect(await postSendQuote("evt-1", INPUT)).toEqual({
      ok: false,
      message: "Failed (502)",
    });
  });

  it("asks the person to sign in again on a 401", async () => {
    stub(async () => ({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) }));
    const result = await postSendQuote("evt-1", INPUT);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toMatch(/sign in again/i);
  });

  it("reports a network failure instead of throwing", async () => {
    stub(async () => {
      throw new Error("offline");
    });
    expect(await postSendQuote("evt-1", INPUT)).toEqual({ ok: false, message: "offline" });
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

describe("address validation and parsing", () => {
  it("accepts ordinary addresses and rejects malformed ones", () => {
    expect(isValidEmail(" a@x.com ")).toBe(true);
    for (const bad of ["", "a", "a@", "@x.com", "a@x", "a b@x.com", "a@x.com,b@x.com"]) {
      expect(isValidEmail(bad)).toBe(false);
    }
  });

  it("accepts plus-tags, subdomains, hyphens inside labels and dots inside the local part", () => {
    for (const ok of ["a+tag@x.com", "first.last@mail.x.co.uk", "a@my-host.com", "a_b@x.io"]) {
      expect(isValidEmail(ok), ok).toBe(true);
    }
  });

  it("rejects control characters, bad dots, bad hyphens and a dotless domain", () => {
    for (const bad of [
      "a\u0000b@x.com",
      "a@x.com\u0007",
      "a\u007f@x.com",
      "a\nb@x.com",
      "a..b@x.com",
      ".a@x.com",
      "a.@x.com",
      "a@x..com",
      "a@-x.com",
      "a@x-.com",
      "a@x.-com",
      "a@x.com-",
      "a@x.com.",
      "a@.x.com",
      "a@@x.com",
      "a@b@x.com",
    ]) {
      expect(isValidEmail(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it("splits pasted text on commas, semicolons and whitespace", () => {
    expect(splitAddressText("a@x.com, b@x.com;c@x.com\n d@x.com ,")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
      "d@x.com",
    ]);
  });

  it("extracts the address from `Name <a@b.com>` and a quoted name containing a comma", () => {
    expect(splitAddressText("Jane Doe <jane@x.com>")).toEqual(["jane@x.com"]);
    expect(splitAddressText('"Smith, John" <j@x.com>')).toEqual(["j@x.com"]);
    expect(splitAddressText("<only@x.com>")).toEqual(["only@x.com"]);
    expect(splitAddressText('Jane <jane@x.com>, "Smith, John" <j@x.com>; plain@x.com')).toEqual([
      "jane@x.com",
      "j@x.com",
      "plain@x.com",
    ]);
  });

  it("never swallows an address that comes before a named one", () => {
    expect(splitAddressText("a@x.com b@y.com <c@d.com>")).toEqual([
      "a@x.com",
      "b@y.com",
      "c@d.com",
    ]);
    expect(splitAddressText("a@x.com Jane Doe <c@d.com>")).toEqual(["a@x.com", "c@d.com"]);
    expect(splitAddressText('a@x.com "Smith, John" <j@x.com>')).toEqual(["a@x.com", "j@x.com"]);
  });

  it("stays linear on very long input", () => {
    for (const input of [
      " ".repeat(50_000),
      "a ".repeat(25_000),
      '"'.repeat(50_000),
      "<".repeat(50_000),
    ]) {
      const t = performance.now();
      splitAddressText(input);
      expect(performance.now() - t).toBeLessThan(100);
    }
  });

  it("drops an empty <> and leaves a lone unmatched piece for validation to refuse", () => {
    expect(splitAddressText("Jane <>")).toEqual([]);
    expect(splitAddressText("a@x.com <b")).toEqual(["a@x.com", "<b"]);
  });

  it("de-duplicates within a field, case-insensitively, keeping the first spelling", () => {
    expect(dedupeAddresses([" A@x.com", "a@X.com", "b@x.com", ""])).toEqual(["A@x.com", "b@x.com"]);
  });
});

describe("addAddress", () => {
  const fields = { to: ["a@x.com"], cc: ["c@x.com"], bcc: [] as string[] };

  it("adds a valid new address, trimmed, to the chosen field", () => {
    const r = addAddress(fields, "bcc", " b@x.com ");
    expect(r).toMatchObject({ ok: true, email: "b@x.com" });
    expect(r.ok && r.fields).toEqual({ to: ["a@x.com"], cc: ["c@x.com"], bcc: ["b@x.com"] });
  });

  it("refuses an invalid address", () => {
    const r = addAddress(fields, "to", "nope");
    expect(r.ok).toBe(false);
  });

  it("refuses an address already in another field and says where", () => {
    const r = addAddress(fields, "bcc", "C@X.com");
    expect(r).toEqual({ ok: false, message: "C@X.com is already in Cc." });
  });

  it("refuses an address already in the same field", () => {
    const r = addAddress(fields, "to", "a@x.com");
    expect(r).toEqual({ ok: false, message: "a@x.com is already in To." });
  });

  it("findAddressField looks at To, Cc and Bcc", () => {
    expect(findAddressField({ to: [], cc: [], bcc: ["Z@x.com"] }, "z@x.com")).toBe("bcc");
    expect(findAddressField(fields, "q@x.com")).toBeNull();
  });
});

describe("buildSendQuoteInput", () => {
  const base = {
    to: ["a@x.com"],
    cc: [],
    bcc: [],
    subject: "  Hello ",
    attachments: [{ key: "quote_pdf" }, { key: "k2" }],
    previewAttachmentKeys: ["quote_pdf", "k1", "k2"],
    addedFiles: [
      {
        id: "f1",
        storagePath: "e/f1.pdf",
        name: "f1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
      },
      {
        id: "f1",
        storagePath: "e/f1.pdf",
        name: "f1.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1,
      },
    ],
  };

  it("lists the template attachments no longer in the dialog as removed, never the quote PDF", () => {
    const r = buildSendQuoteInput({ ...base, attachments: [{ key: "k2" }] });
    expect(r.removedAttachmentKeys).toEqual(["k1"]);
    expect(buildSendQuoteInput(base).removedAttachmentKeys).toEqual(["k1"]);
  });

  it("trims the subject; an empty one stays empty so the server uses the template's", () => {
    expect(buildSendQuoteInput(base).subject).toBe("Hello");
    expect(buildSendQuoteInput({ ...base, subject: "   " }).subject).toBe("");
  });

  it("de-duplicates the added files by id", () => {
    expect(buildSendQuoteInput(base).addedFiles.map((f) => f.id)).toEqual(["f1"]);
  });

  it("keeps an address only in the first of To, Cc, Bcc and de-duplicates within fields", () => {
    const r = buildSendQuoteInput({
      ...base,
      to: ["a@x.com", "A@x.com"],
      cc: ["a@x.com", "c@x.com"],
      bcc: ["C@x.com", "b@x.com"],
    });
    expect(r).toMatchObject({ to: ["a@x.com"], cc: ["c@x.com"], bcc: ["b@x.com"] });
  });
});

describe("checkSendLimits", () => {
  const ok = { to: ["a@x.com"], cc: [], bcc: [], attachmentSizes: [1000, null] };
  const many = (n: number) => Array.from({ length: n }, (_, i) => `u${i}@x.com`);

  it("passes within both limits", () => {
    expect(checkSendLimits(ok)).toEqual({ ok: true });
  });

  it("allows exactly 50 recipients across the three fields and refuses 51", () => {
    expect(checkSendLimits({ ...ok, to: many(20), cc: many(20), bcc: many(10) }).ok).toBe(true);
    const r = checkSendLimits({ ...ok, to: many(20), cc: many(20), bcc: many(11) });
    expect(r).toMatchObject({ ok: false, limit: "recipients" });
    expect(!r.ok && r.message).toMatch(/51/);
  });

  it("compares the base64-encoded size (bytes * 4/3) with the limit, naming the limit", () => {
    const rawMax = Math.floor((MAX_TOTAL_ATTACHMENT_BYTES * 3) / 4);
    // Exactly at the limit once encoded: allowed. One raw byte more tips the encoded size over.
    expect(checkSendLimits({ ...ok, attachmentSizes: [rawMax] }).ok).toBe(true);
    const r = checkSendLimits({ ...ok, attachmentSizes: [rawMax, 2] });
    expect(r).toMatchObject({ ok: false, limit: "attachments" });
    expect(!r.ok && r.message).toMatch(/10\.0 MB/);
  });

  it("refuses a raw total that is under the limit but over it once encoded", () => {
    // 9 MB raw is 12 MB encoded.
    const r = checkSendLimits({ ...ok, attachmentSizes: [9 * 1024 * 1024, null] });
    expect(r).toMatchObject({ ok: false, limit: "attachments" });
  });

  it("counts the quote PDF estimate (1 MB) toward the limit: 7 MB of files plus the PDF is over", () => {
    expect(QUOTE_PDF_ESTIMATE_BYTES).toBe(1024 * 1024);
    const seven = 7 * 1024 * 1024;
    expect(checkSendLimits({ ...ok, attachmentSizes: [null, seven] }).ok).toBe(true);
    const r = checkSendLimits({ ...ok, attachmentSizes: [QUOTE_PDF_ESTIMATE_BYTES, seven] });
    expect(r).toMatchObject({ ok: false, limit: "attachments" });
  });

  it("reports recipients first when both limits are exceeded", () => {
    const r = checkSendLimits({
      ...ok,
      to: many(MAX_RECIPIENTS + 1),
      attachmentSizes: [MAX_TOTAL_ATTACHMENT_BYTES],
    });
    expect(r).toMatchObject({ ok: false, limit: "recipients" });
  });
});

describe("formatRecipientsLine", () => {
  it("writes To, Cc and Bcc separated by semicolons", () => {
    expect(formatRecipientsLine({ to: ["a@x.com"], cc: ["b@x.com"], bcc: ["c@x.com"] })).toBe(
      "To: a@x.com; Cc: b@x.com; Bcc: c@x.com",
    );
  });
  it("leaves out empty Cc and Bcc and joins several addresses with commas", () => {
    expect(formatRecipientsLine({ to: ["a@x.com", "b@x.com"], cc: [], bcc: [] })).toBe(
      "To: a@x.com, b@x.com",
    );
    expect(formatRecipientsLine({ to: ["a@x.com"], cc: [], bcc: ["c@x.com"] })).toBe(
      "To: a@x.com; Bcc: c@x.com",
    );
  });
});
