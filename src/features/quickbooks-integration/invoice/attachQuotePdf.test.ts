import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-04-create.md §5: the quote's own PDF becomes an attachment of the
// invoice, named after the invoice number and never marked to be sent. A failure throws.

const { mockBuild, mockRender, rendered } = vi.hoisted(() => ({
  mockBuild: vi.fn(),
  mockRender: vi.fn(),
  rendered: [] as unknown[],
}));

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: (element: { props: { data: unknown } }) => {
    rendered.push(element.props.data);
    return mockRender();
  },
}));

vi.mock("@/features/quotesAndBookings/pdf/quoteDocumentData", () => ({
  buildQuoteDocumentData: mockBuild,
}));

vi.mock("@/features/quotesAndBookings/pdf/QuotePdfDocument", () => ({
  QuotePdfDocument: (props: unknown) => ({ props }),
}));

vi.mock("../util", () => ({
  getBaseUrl: () => "https://qbo.example.com/v3/company",
  getQboAccessTokenAndRealmId: vi.fn(async () => ({ accessToken: "tok", realmId: "123" })),
}));

import { attachQuotePdf } from "./attachQuotePdf";

type Upload = { url: string; init: RequestInit; metadata: any; fileName: string; fileText: string };

let uploads: Upload[] = [];
let respondWith: { status: number; body: unknown } = { status: 200, body: {} };

beforeEach(() => {
  uploads = [];
  rendered.length = 0;
  respondWith = {
    status: 200,
    body: { AttachableResponse: [{ Attachable: { Id: "att-1" } }] },
  };
  mockRender.mockResolvedValue(Buffer.from("%PDF-1.4"));
  mockBuild.mockResolvedValue({ quoteNumber: "100200300", language: "fr" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      const form = init.body as FormData;
      const file = form.get("file_content_01") as File;
      uploads.push({
        url,
        init,
        metadata: JSON.parse(await (form.get("file_metadata_01") as Blob).text()),
        fileName: file.name,
        fileText: await file.text(),
      });
      return new Response(JSON.stringify(respondWith.body), { status: respondWith.status });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("attachQuotePdf", () => {
  it("names the file after the invoice number", async () => {
    await attachQuotePdf("conn-1", "inv-9", "evt-1");

    expect(uploads).toHaveLength(1);
    expect(uploads[0].fileName).toBe("100200300.pdf");
    expect(uploads[0].metadata.FileName).toBe("100200300.pdf");
    expect(uploads[0].metadata.ContentType).toBe("application/pdf");
    expect(uploads[0].fileText).toBe("%PDF-1.4");
  });

  it("attaches the file to the invoice, to the connection's company, with the token", async () => {
    await attachQuotePdf("conn-1", "inv-9", "evt-1");

    expect(uploads[0].url).toContain("https://qbo.example.com/v3/company/123/upload");
    expect((uploads[0].init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(uploads[0].init.method).toBe("POST");
    expect(uploads[0].metadata.AttachableRef).toEqual([
      { EntityRef: { type: "Invoice", value: "inv-9" }, IncludeOnSend: false },
    ]);
  });

  it("does not mark the attachment to be included when the invoice is sent", async () => {
    await attachQuotePdf("conn-1", "inv-9", "evt-1");

    for (const ref of uploads[0].metadata.AttachableRef) {
      expect(ref.IncludeOnSend).toBe(false);
    }
  });

  it("renders the quote's own document, in the quote's own language", async () => {
    await attachQuotePdf("conn-1", "inv-9", "evt-1");

    expect(mockBuild).toHaveBeenCalledWith("evt-1");
    expect(rendered).toEqual([{ quoteNumber: "100200300", language: "fr" }]);
  });

  it("throws when the quote cannot be found, and uploads nothing", async () => {
    mockBuild.mockResolvedValue(null);

    await expect(attachQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/not found/i);
    expect(uploads).toHaveLength(0);
  });

  it("throws when the PDF cannot be rendered, and uploads nothing", async () => {
    mockRender.mockRejectedValue(new Error("render blew up"));

    await expect(attachQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/render blew up/);
    expect(uploads).toHaveLength(0);
  });

  it("throws, with QuickBooks' text, when the upload is refused", async () => {
    respondWith = {
      status: 400,
      body: { Fault: { Error: [{ Message: "Bad", Detail: "The file is too large" }] } },
    };

    await expect(attachQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/too large/);
  });

  it("throws when the upload answers 200 with a fault inside the attachable response", async () => {
    respondWith = {
      status: 200,
      body: {
        AttachableResponse: [{ Fault: { Error: [{ Message: "Bad", Detail: "Invalid entity" }] } }],
      },
    };

    await expect(attachQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/Invalid entity/);
  });

  it("throws on a platform error page without JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 })),
    );

    await expect(attachQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/502/);
  });
});
