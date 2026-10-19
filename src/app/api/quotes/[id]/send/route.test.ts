import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let userId: string | null = "user_1";
const sendTriggerEmail = vi.fn();
const inserts: Array<{ table: string; row: any }> = [];
const uploads: string[] = [];
let eventFiles: Array<{
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
}> = [];
let downloadOk = true;

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId }) }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: async () => Buffer.from("pdf") }));
vi.mock("@/features/quotesAndBookings/pdf/quoteDocumentData", () => ({
  buildQuoteDocumentData: async () => ({ quoteNumber: "Q-1" }),
}));
vi.mock("@/features/quotesAndBookings/pdf/QuotePdfDocument", () => ({
  QuotePdfDocument: () => null,
}));
vi.mock("@/features/automaticEmails/server/sendTriggerEmail", () => ({
  sendTriggerEmail: (...args: unknown[]) => sendTriggerEmail(...args),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => {
        const b: any = {
          eq: () => b,
          in: async () => ({ data: eventFiles }),
          maybeSingle: async () => ({ data: { id: "app-user" } }),
        };
        return b;
      },
      insert: async (row: any) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        download: async () =>
          downloadOk
            ? { data: { arrayBuffer: async () => new Uint8Array([7]).buffer }, error: null }
            : { data: null, error: { message: "nope" } },
        upload: async (path: string) => {
          uploads.push(path);
          return { error: null };
        },
      }),
    },
  }),
}));

import { POST } from "./route";

const call = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/quotes/evt-1/send", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "evt-1" }) },
  );

const BODY = {
  to: ["a@x.com"],
  cc: ["c@x.com"],
  bcc: ["b@x.com"],
  subject: "Hi",
  removedAttachmentKeys: ["r1", "quote_pdf"],
  addedFileIds: [],
};

beforeEach(() => {
  userId = "user_1";
  eventFiles = [];
  downloadOk = true;
  inserts.length = 0;
  uploads.length = 0;
  sendTriggerEmail.mockReset();
  sendTriggerEmail.mockResolvedValue({ sent: true, to: "a@x.com" });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://x");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
});

describe("POST /api/quotes/[id]/send", () => {
  it("answers 401 when not signed in and sends nothing", async () => {
    userId = null;
    expect((await call(BODY)).status).toBe(401);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("refuses a body with no To address", async () => {
    expect((await call({ ...BODY, to: [] })).status).toBe(400);
    expect((await call({ ...BODY, to: ["  "] })).status).toBe(400);
    expect((await call({ recipientEmails: ["a@x.com"] })).status).toBe(400); // old shape
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("refuses an invalid address in any field", async () => {
    expect((await call({ ...BODY, bcc: ["nope"] })).status).toBe(400);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("refuses more than 50 recipients in total", async () => {
    const many = Array.from({ length: 51 }, (_, i) => `u${i}@x.com`);
    const res = await call({
      ...BODY,
      to: many.slice(0, 20),
      cc: many.slice(20, 40),
      bcc: many.slice(40),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too many recipients/i);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("passes To, Cc, Bcc, subject and removals on, ignoring quote_pdf in the removals", async () => {
    const res = await call(BODY);
    expect(res.status).toBe(200);
    const arg = sendTriggerEmail.mock.calls[0][0];
    expect(arg).toMatchObject({
      recipientOverride: "a@x.com",
      cc: ["c@x.com"],
      bcc: ["b@x.com"],
      subject: "Hi",
      omitAttachmentKeys: ["r1"],
    });
    // The quote PDF is always attached.
    expect(arg.attachments[0]).toMatchObject({ name: "Q-1.pdf", contentType: "application/pdf" });
  });

  it("an empty subject is passed through empty so the template's is used", async () => {
    await call({ ...BODY, subject: "" });
    expect(sendTriggerEmail.mock.calls[0][0].subject).toBe("");
  });

  it("attaches the files added in the dialog, read from storage", async () => {
    eventFiles = [
      { id: "f1", file_name: "extra.png", storage_path: "evt-1/extra.png", mime_type: "image/png" },
    ];
    const res = await call({ ...BODY, addedFileIds: ["f1"] });
    expect(res.status).toBe(200);
    const names = sendTriggerEmail.mock.calls[0][0].attachments.map((a: any) => a.name);
    expect(names).toEqual(["Q-1.pdf", "extra.png"]);
  });

  it("stops before sending when an added file is not found or unreadable", async () => {
    expect((await call({ ...BODY, addedFileIds: ["missing"] })).status).toBe(400);
    eventFiles = [{ id: "f1", file_name: "e.png", storage_path: "p", mime_type: null }];
    downloadOk = false;
    expect((await call({ ...BODY, addedFileIds: ["f1"] })).status).toBe(400);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("still saves the quote PDF to Files as sent_quote after a send", async () => {
    await call(BODY);
    expect(uploads).toHaveLength(1);
    expect(inserts.find((i) => i.table === "EventFiles")?.row).toMatchObject({
      event_uuid: "evt-1",
      source: "sent_quote",
      file_name: "Q-1.pdf",
    });
  });

  it("returns the error and saves nothing when the send fails", async () => {
    sendTriggerEmail.mockResolvedValue({ sent: false, reason: "No template" });
    const res = await call(BODY);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "No template" });
    expect(inserts).toHaveLength(0);
  });
});
