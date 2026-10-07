import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({
  useClerkSupabaseClient: () => ({
    storage: {
      from: () => ({
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://cdn.test/driver-documents/${path}` },
        }),
      }),
    },
  }),
}));

const { DriverDocumentCard } = await import("./DriverDocumentCard");

const noop = () => {};

function render(props: Partial<Parameters<typeof DriverDocumentCard>[0]> = {}) {
  return renderToStaticMarkup(
    <DriverDocumentCard
      label="Driver's License"
      hint="Front of the licence, or a PDF scan."
      bucket="driver-documents"
      storagePath="driver-1/license"
      value={null}
      onChange={noop}
      expiresOn={null}
      onExpiresOnChange={noop}
      todayIso="2026-08-28"
      {...props}
    />,
  );
}

describe("DriverDocumentCard", () => {
  it("prompts for an upload when the document is missing", () => {
    const html = render();
    expect(html).toContain("Driver&#x27;s License");
    expect(html).toContain("Front of the licence, or a PDF scan.");
    expect(html).toContain("Not uploaded");
    expect(html).toContain('type="file"');
  });

  it("offers the expiry date even before a file is uploaded", () => {
    // An admin often knows the expiry before the driver sends the scan.
    expect(render()).toContain('type="date"');
  });

  it("shows an image document as a thumbnail served from storage", () => {
    const html = render({ value: "driver-1/license_1712.jpg" });
    expect(html).toContain('src="https://cdn.test/driver-documents/driver-1/license_1712.jpg"');
    expect(html).toContain("license_1712.jpg");
  });

  it("links a PDF instead of trying to inline it", () => {
    const html = render({ value: "driver-1/license_1712.pdf" });
    expect(html).not.toContain("<img");
    expect(html).toContain('href="https://cdn.test/driver-documents/driver-1/license_1712.pdf"');
    expect(html).toContain("PDF");
  });

  it("renders the stored expiry date into the date input", () => {
    expect(render({ value: "driver-1/license_1.jpg", expiresOn: "2027-03-04" })).toContain(
      'value="2027-03-04"',
    );
  });

  it("surfaces an expired document in the status badge", () => {
    const html = render({ value: "driver-1/license_1.jpg", expiresOn: "2026-08-01" });
    expect(html).toContain("Expired 27 days ago");
  });

  it("warns when the document is inside the renewal window", () => {
    const html = render({ value: "driver-1/license_1.jpg", expiresOn: "2026-09-05" });
    expect(html).toContain("Expires in 8 days");
  });

  it("stays quiet for a document that is well in date", () => {
    const html = render({ value: "driver-1/license_1.jpg", expiresOn: "2028-01-01" });
    expect(html).toContain("Valid");
    expect(html).not.toContain("Expires in");
  });

  it("labels its controls for the document it belongs to", () => {
    const html = render({ value: "driver-1/license_1.jpg" });
    expect(html).toContain("Replace Driver&#x27;s License");
    expect(html).toContain("Remove Driver&#x27;s License");
    expect(html).toContain("Driver&#x27;s License expiry date");
  });

  it("hides every control when disabled", () => {
    const html = render({ value: "driver-1/license_1.jpg", disabled: true });
    expect(html).not.toContain('type="file"');
    expect(html).toContain("disabled");
  });

  // docs/specs/accountant-team.md §13: a document that cannot be changed can still be opened. The
  // Driver Setup block of a locked form does not take the pointer, so the card opts back in.
  describe("when disabled, the document can still be opened", () => {
    const disabledImage = () => render({ value: "driver-1/license_1712.jpg", disabled: true });

    it("keeps the preview and the file name as links to the stored file, in a new tab", () => {
      const html = disabledImage();
      const links = html.match(
        /<a [^>]*href="https:\/\/cdn\.test\/driver-documents\/driver-1\/license_1712\.jpg"[^>]*>/g,
      );
      expect(links).toHaveLength(2);
      for (const link of links ?? []) {
        expect(link).toContain('target="_blank"');
        expect(link).toContain('rel="noopener noreferrer"');
      }
    });

    it("takes the pointer inside a form that blocks it", () => {
      expect(disabledImage()).toContain("pointer-events-auto");
    });

    it("still offers no way to upload, replace or remove it", () => {
      const html = disabledImage();
      expect(html).not.toContain('type="file"');
      expect(html).not.toContain("Replace");
      expect(html).not.toContain("Remove Driver");
    });

    it("keeps the expiry date from being edited", () => {
      expect(disabledImage()).toMatch(/<input[^>]*type="date"[^>]*disabled=""/);
    });

    it("opens a PDF the same way", () => {
      const html = render({ value: "driver-1/license_1712.pdf", disabled: true });
      expect(html).toContain('href="https://cdn.test/driver-documents/driver-1/license_1712.pdf"');
      expect(html).toContain("pointer-events-auto");
    });

    // The Driver Setup block of a locked form is faded to say "read-only". The document itself is
    // what the reader came to look at, so the photo and its file name are not faded; the rest of the
    // card is. A parent's opacity cannot be undone by a child, so the card must not sit in a faded
    // wrapper and fades its own parts.
    describe("fading", () => {
      const classOf = (html: string, pattern: RegExp) => html.match(pattern)?.[1] ?? null;

      it("leaves the card and the preview unfaded", () => {
        const html = disabledImage();
        expect(classOf(html, /<div class="(rounded-lg[^"]*)"/)).not.toContain("opacity-60");
        const anchors = html.match(/<a [^>]*>/g) ?? [];
        expect(anchors).toHaveLength(2);
        for (const anchor of anchors) expect(anchor).not.toContain("opacity-60");
      });

      it("leaves the file name unfaded", () => {
        const html = disabledImage();
        expect(classOf(html, /<p class="([^"]*)"><a /)).not.toContain("opacity-60");
      });

      it("fades the label with its status, and the expiry row", () => {
        const html = disabledImage();
        expect(html).toMatch(
          /<div class="[^"]*\bopacity-60\b[^"]*"><span class="text-sm font-medium text-gray-900">Driver&#x27;s License<\/span>/,
        );
        expect(html).toMatch(
          /<div class="[^"]*\bopacity-60\b[^"]*"><label[^>]*><span>Expires<\/span>/,
        );
      });

      it("fades the hint of a document that is not uploaded, and its empty preview", () => {
        const html = render({ value: null, disabled: true });
        expect(classOf(html, /<p class="([^"]*)">Front of the licence/)).toContain("opacity-60");
        expect(html).toMatch(/<div class="[^"]*\bopacity-60\b[^"]*" aria-hidden="true">/);
      });

      it("leaves the icon that stands in for an uploaded PDF unfaded, as it is the document", () => {
        const html = render({ value: "driver-1/license_1712.pdf", disabled: true });
        expect(html).toMatch(/<div class="[^"]*" aria-hidden="true">/);
        expect(html).not.toMatch(/<div class="[^"]*\bopacity-60\b[^"]*" aria-hidden="true">/);
        // ...while the label and the expiry row of that card are still faded.
        expect(html).toMatch(
          /<div class="[^"]*\bopacity-60\b[^"]*"><span class="text-sm font-medium/,
        );
      });

      it("fades nothing in an editable card", () => {
        expect(render({ value: "driver-1/license_1712.jpg" })).not.toContain("opacity-60");
      });
    });

    it("does not add the opt-in to an editable card", () => {
      expect(render({ value: "driver-1/license_1712.jpg" })).not.toContain("pointer-events-auto");
    });
  });
});
