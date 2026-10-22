import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-04-create.md §5: the quote's own PDF becomes an attachment of the
// invoice, named after the invoice number and never marked to be sent. A failure throws.
// docs/specs/qbo-invoice-05-update.md §5: replacing deletes the app's own file of the invoice, by its
// name, then attaches the new one; the accountant's own attachments are left alone.

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

import { attachQuotePdf, replaceQuotePdf } from "./attachQuotePdf";

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

describe("replaceQuotePdf", () => {
  type Call = {
    kind: "list" | "delete" | "upload";
    url: string;
    body?: unknown;
    fileName?: string;
  };

  let fetchCalls: Call[];
  let attachables: Array<Record<string, unknown>>;
  let listResponse: { status: number; body: unknown };
  let deleteResponse: { status: number; body: unknown };
  let uploadResponse: { status: number; body: unknown };

  beforeEach(() => {
    fetchCalls = [];
    attachables = [];
    listResponse = { status: 200, body: {} };
    deleteResponse = { status: 200, body: { Attachable: { status: "Deleted" } } };
    uploadResponse = {
      status: 200,
      body: { AttachableResponse: [{ Attachable: { Id: "att-9" } }] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = new URL(url);
        if (u.pathname.endsWith("/query")) {
          fetchCalls.push({ kind: "list", url });
          const body =
            listResponse.status === 200
              ? { QueryResponse: { Attachable: attachables } }
              : listResponse.body;
          return new Response(JSON.stringify(body), { status: listResponse.status });
        }
        if (u.pathname.endsWith("/attachable")) {
          fetchCalls.push({ kind: "delete", url, body: JSON.parse(String(init?.body)) });
          return new Response(JSON.stringify(deleteResponse.body), {
            status: deleteResponse.status,
          });
        }
        const form = init?.body as FormData;
        fetchCalls.push({
          kind: "upload",
          url,
          fileName: (form.get("file_content_01") as File).name,
        });
        return new Response(JSON.stringify(uploadResponse.body), { status: uploadResponse.status });
      }),
    );
  });

  it("lists the invoice's attachments by their reference to it, in the connection's company", async () => {
    await replaceQuotePdf("conn-1", "inv-9", "evt-1");

    const list = fetchCalls.find((call) => call.kind === "list")!;
    expect(list.url).toContain("https://qbo.example.com/v3/company/123/query");
    const query = new URL(list.url).searchParams.get("query")!;
    expect(query).toContain("from Attachable");
    expect(query).toContain("AttachableRef.EntityRef.Type = 'Invoice'");
    expect(query).toContain("AttachableRef.EntityRef.value = 'inv-9'");
  });

  it("deletes only the file named after the invoice number, then uploads the new one", async () => {
    attachables = [
      { Id: "11", SyncToken: "2", FileName: "100200300.pdf" },
      { Id: "12", SyncToken: "0", FileName: "Signed contract.pdf" },
      { Id: "13", SyncToken: "0", FileName: "100200300.pdf.bak" },
    ];

    await replaceQuotePdf("conn-1", "inv-9", "evt-1");

    expect(fetchCalls.map((call) => call.kind)).toEqual(["list", "delete", "upload"]);
    const del = fetchCalls[1];
    expect(del.url).toContain("/123/attachable");
    expect(new URL(del.url).searchParams.get("operation")).toBe("delete");
    expect(del.body).toEqual({ Id: "11", SyncToken: "2" });
    expect(fetchCalls[2].fileName).toBe("100200300.pdf");
  });

  it("deletes every copy of the app's own file", async () => {
    attachables = [
      { Id: "11", SyncToken: "0", FileName: "100200300.pdf" },
      { Id: "14", SyncToken: "1", FileName: "100200300.pdf" },
    ];

    await replaceQuotePdf("conn-1", "inv-9", "evt-1");

    expect(fetchCalls.filter((call) => call.kind === "delete").map((c) => c.body)).toEqual([
      { Id: "11", SyncToken: "0" },
      { Id: "14", SyncToken: "1" },
    ]);
  });

  it("deletes nothing when the invoice has no file of the app's, and still uploads", async () => {
    attachables = [{ Id: "12", SyncToken: "0", FileName: "Signed contract.pdf" }, { Id: "15" }];

    await replaceQuotePdf("conn-1", "inv-9", "evt-1");

    expect(fetchCalls.map((call) => call.kind)).toEqual(["list", "upload"]);
  });

  it("uploads the new file like attachQuotePdf: named after the number, not set to be sent", async () => {
    await replaceQuotePdf("conn-1", "inv-9", "evt-1");

    expect(mockBuild).toHaveBeenCalledWith("evt-1");
    expect(rendered).toEqual([{ quoteNumber: "100200300", language: "fr" }]);
    expect(fetchCalls.at(-1)).toMatchObject({ kind: "upload", fileName: "100200300.pdf" });
  });

  it("throws when the quote cannot be found, before it touches the invoice's attachments", async () => {
    mockBuild.mockResolvedValue(null);
    attachables = [{ Id: "11", SyncToken: "0", FileName: "100200300.pdf" }];

    await expect(replaceQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/not found/i);
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws when the PDF cannot be rendered, and the old file is kept", async () => {
    mockRender.mockRejectedValue(new Error("render blew up"));
    attachables = [{ Id: "11", SyncToken: "0", FileName: "100200300.pdf" }];

    await expect(replaceQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/render blew up/);
    expect(fetchCalls).toHaveLength(0);
  });

  it("throws, with QuickBooks' text, when the attachments cannot be listed, and uploads nothing", async () => {
    listResponse = {
      status: 400,
      body: { Fault: { Error: [{ Message: "Bad", Detail: "Query is malformed" }] } },
    };

    await expect(replaceQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/Query is malformed/);
    expect(fetchCalls.map((call) => call.kind)).toEqual(["list"]);
  });

  it("throws when an old file cannot be deleted, and uploads nothing", async () => {
    attachables = [{ Id: "11", SyncToken: "0", FileName: "100200300.pdf" }];
    deleteResponse = {
      status: 400,
      body: { Fault: { Error: [{ Message: "Bad", Detail: "Stale Object Error" }] } },
    };

    await expect(replaceQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/Stale Object/);
    expect(fetchCalls.map((call) => call.kind)).toEqual(["list", "delete"]);
  });

  it("throws when the new file cannot be uploaded", async () => {
    uploadResponse = {
      status: 400,
      body: { Fault: { Error: [{ Message: "Bad", Detail: "The file is too large" }] } },
    };

    await expect(replaceQuotePdf("conn-1", "inv-9", "evt-1")).rejects.toThrow(/too large/);
  });
});
