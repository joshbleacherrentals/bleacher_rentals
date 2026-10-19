import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let userId: string | null = "user_1";
const sendTriggerEmail = vi.fn();
const inserts: Array<{ table: string; row: any }> = [];
const uploads: string[] = [];
let downloadOk = true;
const downloaded: string[] = [];
let failAddedInsert = false;
let existingRows: Array<{ id: string }> = [];
let objectGone = false;

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
          in: async () => ({ data: existingRows, error: null }),
          maybeSingle: async () => ({ data: { id: "app-user" } }),
        };
        return b;
      },
      insert: async (row: any) => {
        if (failAddedInsert && row.source === "email_attachment") {
          return { error: { message: "rls" } };
        }
        inserts.push({ table, row });
        return { error: null };
      },
    }),
    storage: {
      from: () => ({
        download: async (path: string) => (
          downloaded.push(path),
          downloadOk
            ? { data: { arrayBuffer: async () => new Uint8Array([7]).buffer }, error: null }
            : { data: null, error: { message: "nope" } }
        ),
        list: async (_dir: string, opts: { search: string }) => ({
          data: objectGone ? [] : [{ name: opts.search }],
          error: null,
        }),
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
  addedFiles: [],
};

const EV = "evt-1";
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const added = (over: Record<string, unknown> = {}) => ({
  id: UUID_A,
  storagePath: `${EV}/${UUID_B}.png`,
  name: "extra.png",
  mimeType: "image/png",
  sizeBytes: 1,
  ...over,
});

beforeEach(() => {
  userId = "user_1";
  downloadOk = true;
  downloaded.length = 0;
  failAddedInsert = false;
  existingRows = [];
  objectGone = false;
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
    const res = await call({ ...BODY, addedFiles: [added()] });
    expect(res.status).toBe(200);
    const names = sendTriggerEmail.mock.calls[0][0].attachments.map((a: any) => a.name);
    expect(names).toEqual(["Q-1.pdf", "extra.png"]);
    expect(downloaded).toEqual([`${EV}/${UUID_B}.png`]);
  });

  it("inserts the EventFiles row only after the send, with the client id and source email_attachment", async () => {
    let insertsAtSend = -1;
    sendTriggerEmail.mockImplementation(async () => {
      insertsAtSend = inserts.length;
      return { sent: true, to: "a@x.com" };
    });
    const res = await call({ ...BODY, addedFiles: [added()] });
    expect(res.status).toBe(200);
    expect(insertsAtSend).toBe(0); // nothing recorded while the email was being sent
    const row = inserts.find((i) => i.row.source === "email_attachment")?.row;
    expect(row).toMatchObject({
      id: UUID_A,
      event_uuid: EV,
      file_name: "extra.png",
      storage_path: `${EV}/${UUID_B}.png`,
      mime_type: "image/png",
      file_size_bytes: 1, // the stored object's real size (one byte in the mock)
      source: "email_attachment",
      uploaded_by: "app-user",
    });
  });

  it("inserts no EventFiles row when the send fails", async () => {
    sendTriggerEmail.mockResolvedValue({ sent: false, reason: "Postmark down" });
    const res = await call({ ...BODY, addedFiles: [added()] });
    expect(res.status).toBe(500);
    expect(inserts).toHaveLength(0);
    expect(uploads).toHaveLength(0);
  });

  it("inserts no row when a 400 stops the request", async () => {
    expect(
      (await call({ ...BODY, addedFiles: [added({ storagePath: `${EV}/../x.png` })] })).status,
    ).toBe(400);
    downloadOk = false;
    expect((await call({ ...BODY, addedFiles: [added()] })).status).toBe(400);
    expect(inserts).toHaveLength(0);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("still answers ok when recording an added file fails after the email went out", async () => {
    failAddedInsert = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await call({ ...BODY, addedFiles: [added()] });
    expect(res.status).toBe(200);
    expect(sendTriggerEmail).toHaveBeenCalledTimes(1);
    // The email carried the file, so the attachment names the log row is built from still include it.
    expect(sendTriggerEmail.mock.calls[0][0].attachments.map((a: any) => a.name)).toContain(
      "extra.png",
    );
    // The sent_quote row is still saved.
    expect(inserts.some((i) => i.row.source === "sent_quote")).toBe(true);
  });

  it("refuses a file that already has an EventFiles row and sends nothing", async () => {
    existingRows = [{ id: "someone" }];
    const res = await call({ ...BODY, addedFiles: [added()] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/already saved in Files/i);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(0);
  });

  it("refuses an old client's addedFileIds with a reload message", async () => {
    const res = await call({ ...BODY, addedFileIds: ["f1"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reload/i);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("refuses more than 20 added files", async () => {
    const files = Array.from({ length: 21 }, (_, i) =>
      added({
        id: `11111111-1111-4111-8111-${String(i).padStart(12, "0")}`,
        storagePath: `${EV}/22222222-2222-4222-8222-${String(i).padStart(12, "0")}.png`,
      }),
    );
    const res = await call({ ...BODY, addedFiles: files });
    expect(res.status).toBe(400);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("skips the row, logs, and still answers ok when the object vanished during the send", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    sendTriggerEmail.mockImplementation(async () => {
      objectGone = true;
      return { sent: true, to: "a@x.com" };
    });
    const res = await call({ ...BODY, addedFiles: [added()] });
    expect(res.status).toBe(200);
    expect(inserts.some((i) => i.row.source === "email_attachment")).toBe(false);
    expect(inserts.some((i) => i.row.source === "sent_quote")).toBe(true);
    expect(err).toHaveBeenCalled();
  });

  describe("path validation of added files", () => {
    it.each([
      ["another event's folder", `other-evt/${UUID_B}.png`],
      ["a parent-folder trick", `${EV}/../other-evt/${UUID_B}.png`],
      ["a nested path", `${EV}/sub/${UUID_B}.png`],
      ["the sent-quote naming", `${EV}/sent-quote-123.pdf`],
      ["an absolute path", `/${EV}/${UUID_B}.png`],
      ["a prefix of the event id", `${EV}x/${UUID_B}.png`],
    ])("refuses %s and sends nothing", async (_n, storagePath) => {
      const res = await call({ ...BODY, addedFiles: [added({ storagePath })] });
      expect(res.status).toBe(400);
      expect(sendTriggerEmail).not.toHaveBeenCalled();
      expect(downloaded).toEqual([]);
    });

    it("refuses a missing object", async () => {
      downloadOk = false;
      const res = await call({ ...BODY, addedFiles: [added()] });
      expect(res.status).toBe(400);
      expect(sendTriggerEmail).not.toHaveBeenCalled();
    });

    it("refuses malformed file entries and unaccepted types", async () => {
      for (const bad of [
        added({ id: "not-a-uuid" }),
        added({ name: "" }),
        added({ name: "a".repeat(256) }),
        added({ name: "../x.png" }),
        added({ sizeBytes: -1 }),
        added({ mimeType: "" }),
        "f1",
      ]) {
        expect((await call({ ...BODY, addedFiles: [bad] })).status).toBe(400);
      }
      expect(
        (await call({ ...BODY, addedFiles: [added({ mimeType: "application/x-msdownload" })] }))
          .status,
      ).toBe(400);
    });
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
