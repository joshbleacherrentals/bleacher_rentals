import { describe, it, expect } from "vitest";
import { attachmentRows, attachmentSizes, openingRecipients } from "./sendDialogModel";
import { QUOTE_PDF_ESTIMATE_BYTES, QUOTE_PDF_KEY } from "../../utils/sendQuote";

const preview = [
  { key: QUOTE_PDF_KEY, name: "Quote.pdf", url: "u0", sizeBytes: null },
  { key: "t1", name: "FAQ.pdf", url: "u1", sizeBytes: 500 },
  { key: "t2", name: "Terms.pdf", url: "u2" },
];
const file = new File(["abc"], "mine.pdf", { type: "application/pdf" });

describe("attachmentRows", () => {
  it("lists the preview files, then added files marked pending", () => {
    const rows = attachmentRows(preview, new Set(), [{ id: "p1", file }]);
    expect(rows.map((r) => [r.key, r.locked, r.pending])).toEqual([
      [QUOTE_PDF_KEY, true, false],
      ["t1", false, false],
      ["t2", false, false],
      ["p1", false, true],
    ]);
  });

  it("drops removed template files but never the quote PDF", () => {
    const rows = attachmentRows(preview, new Set(["t1", QUOTE_PDF_KEY]), []);
    expect(rows.map((r) => r.key)).toEqual([QUOTE_PDF_KEY, "t2"]);
  });

  it("counts the PDF at the 1 MB estimate, other unknown sizes as null (0) and the real size for files", () => {
    const rows = attachmentRows(preview, new Set(), [{ id: "p1", file }]);
    expect(attachmentSizes(rows)).toEqual([QUOTE_PDF_ESTIMATE_BYTES, 500, null, 3]);
  });
});

describe("openingRecipients", () => {
  const frozen = ["a@x.com"];
  it("keeps the frozen list when the live list changes mid-opening", () => {
    expect(openingRecipients(frozen, ["b@x.com"], "review")).toBe(frozen);
    expect(openingRecipients(frozen, [], "sending")).toBe(frozen);
    expect(openingRecipients(frozen, ["b@x.com"], "error")).toBe(frozen);
  });
  it("adopts the first non-empty list only for an opening that started empty, on the review form", () => {
    const live = ["b@x.com"];
    expect(openingRecipients([], live, "review")).toBe(live);
    expect(openingRecipients([], live, "sending")).toEqual([]);
    expect(openingRecipients([], [], "review")).toEqual([]);
  });
});
