import { describe, expect, it } from "vitest";
import { pdfTarget } from "./pdfTarget";

// Spec: docs/specs/accountant-collections-15-open-pdf.md §3 and §5.

describe("pdfTarget", () => {
  it("gives the signed target when the signature stored a PDF", () => {
    expect(pdfTarget({ eventId: "evt-1", signedPdfPath: "evt-1/sig-1.pdf" })).toEqual({
      kind: "signed",
      bucket: "contracts",
      path: "evt-1/sig-1.pdf",
    });
  });

  it("keeps the path as stored: it has no bucket prefix, none is added or removed", () => {
    const target = pdfTarget({ eventId: "evt-1", signedPdfPath: "evt-1/sig-1.pdf" });
    expect(target.kind === "signed" && target.path).toBe("evt-1/sig-1.pdf");
  });

  it.each([
    ["an empty path", ""],
    ["no path", null],
    ["a path that was never written", undefined],
    ["a blank path", "   "],
  ])("gives the quote target for %s, with the event's id in the address", (_, signedPdfPath) => {
    expect(pdfTarget({ eventId: "evt-7", signedPdfPath })).toEqual({
      kind: "quote",
      href: "/api/quotes/evt-7/pdf",
    });
  });
});
