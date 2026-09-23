import { describe, it, expect, vi, beforeEach } from "vitest";
import type { QuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { QUOTE_SIGNED_CLIENT, QUOTE_SIGNED_AM } from "../triggers";

const { mockSendEmail } = vi.hoisted(() => ({ mockSendEmail: vi.fn() }));

vi.mock("postmark", () => ({
  ServerClient: class {
    sendEmail = mockSendEmail;
  },
}));

import { sendTriggerEmail, resolveTriggerEmail } from "./sendTriggerEmail";

// ── Fake Supabase ─────────────────────────────────────────────────────────────
type FakeConfig = {
  event?: { sales_office_uuid: string | null } | null;
  binding?: { id: string } | null;
  template?: { id: string; subject: string; html_body: string } | null;
  attachments?: Array<{ file_name: string; storage_path: string; mime_type: string | null }>;
  download?: { ok: boolean };
};

function makeSupabase(cfg: FakeConfig) {
  const inserted: Array<{ table: string; row: any }> = [];

  const singleFor = (table: string) => {
    if (table === "Events") return { data: cfg.event ?? null };
    if (table === "EmailTriggerBindings") return { data: cfg.binding ?? null };
    if (table === "EmailTemplates") return { data: cfg.template ?? null };
    return { data: null };
  };

  const supabase: any = {
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        maybeSingle: () => Promise.resolve(singleFor(table)),
        order: () => Promise.resolve({ data: cfg.attachments ?? [] }),
        insert: (row: any) => {
          inserted.push({ table, row });
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
    storage: {
      from: () => ({
        download: () =>
          cfg.download?.ok
            ? Promise.resolve({
                data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
                error: null,
              })
            : Promise.resolve({ data: null, error: { message: "not found" } }),
      }),
    },
  };

  return { supabase, inserted };
}

function doc(over: Partial<QuoteDocumentData> = {}): QuoteDocumentData {
  return {
    contact: { name: "Jordan Ellis", email: "jordan@example.com", phone: "" },
    publicUrl: "https://x",
    quoteNumber: "Q-1",
    venue: { name: "V", street: "", city: "", state: "", zip: "" },
    dates: { eventStart: "2026-10-12", eventEnd: "" },
    totalCents: 1000,
    accountManager: "Sam Rivera",
    accountManagerEmail: "sam@bleacherrentals.com",
    company: { name: "BR" },
    currency: "USD",
    ...over,
  } as unknown as QuoteDocumentData;
}

const READY: FakeConfig = {
  event: { sales_office_uuid: "office-1" },
  binding: { id: "b-1" },
  template: { id: "t-1", subject: "Hi {{firstName}}", html_body: "<p>{{total}}</p>" },
};

function lastEmailLog(inserted: Array<{ table: string; row: any }>) {
  return inserted.filter((i) => i.table === "EventEmailLog").at(-1)?.row;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({});
  process.env.POSTMARK_API_KEY = "key";
  process.env.POSTMARK_FROM_EMAIL = "from@bleacherrentals.com";
});

describe("guard ladder — nothing sends and every attempt is logged", () => {
  it("unknown trigger", async () => {
    const { supabase, inserted } = makeSupabase(READY);
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: "nope",
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: false });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(lastEmailLog(inserted)?.status).toBe("failed");
  });

  // it("trigger not wired (coming soon)", async () => {
  //   const { supabase } = makeSupabase(READY);
  //   const r = await sendTriggerEmail({ supabaseAdmin: supabase, trigger: PAYMENT_DUE_CLIENT, eventId: "e1", docData: doc() });
  //   expect(r).toMatchObject({ sent: false });
  //   expect(mockSendEmail).not.toHaveBeenCalled();
  // });

  it("missing Postmark credentials", async () => {
    delete process.env.POSTMARK_API_KEY;
    const { supabase } = makeSupabase(READY);
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: false });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("event has no sales office", async () => {
    const { supabase } = makeSupabase({ ...READY, event: { sales_office_uuid: null } });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: false });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("no binding for this office+trigger", async () => {
    const { supabase } = makeSupabase({ ...READY, binding: null });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: false });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("no active template", async () => {
    const { supabase } = makeSupabase({ ...READY, template: null });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: false });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("no recipient email", async () => {
    const { supabase } = makeSupabase(READY);
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc({ contact: null } as any),
    });
    expect(r).toMatchObject({ sent: false });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

describe("sender identity", () => {
  it("client emails send AS the account manager, to the client", async () => {
    const { supabase, inserted } = makeSupabase(READY);
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: true, to: "jordan@example.com" });
    const arg = mockSendEmail.mock.calls[0][0];
    expect(arg.From).toBe("Sam Rivera <sam@bleacherrentals.com>");
    expect(arg.To).toBe("jordan@example.com");
    expect(arg.Subject).toBe("Hi Jordan"); // variables substituted
    expect(arg.HtmlBody).toContain("$10.00");
    expect(lastEmailLog(inserted)?.status).toBe("sent");
  });

  it("account-manager emails send from the default address, to the AM", async () => {
    const { supabase } = makeSupabase(READY);
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_AM,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: true, to: "sam@bleacherrentals.com" });
    expect(mockSendEmail.mock.calls[0][0].From).toBe("from@bleacherrentals.com");
  });

  it("falls back to the default from-address when the AM has no email", async () => {
    const { supabase } = makeSupabase(READY);
    await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc({ accountManagerEmail: null } as any),
    });
    // No AM email → sends from the default address, still as the AM's name.
    expect(mockSendEmail.mock.calls[0][0].From).toBe("Sam Rivera <from@bleacherrentals.com>");
  });
});

describe("recipient override", () => {
  it("wins over the resolved recipient", async () => {
    const { supabase } = makeSupabase(READY);
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
      recipientOverride: "finance@example.com",
    });
    expect(r).toMatchObject({ sent: true, to: "finance@example.com" });
    expect(mockSendEmail.mock.calls[0][0].To).toBe("finance@example.com");
  });
});

describe("attachments", () => {
  it("merges caller-supplied and stored attachments", async () => {
    const { supabase } = makeSupabase({
      ...READY,
      attachments: [
        { file_name: "coi.pdf", storage_path: "p/coi.pdf", mime_type: "application/pdf" },
      ],
      download: { ok: true },
    });
    await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
      attachments: [
        { name: "quote.pdf", content: Buffer.from("x"), contentType: "application/pdf" },
      ],
    });
    const arg = mockSendEmail.mock.calls[0][0];
    expect(arg.Attachments).toHaveLength(2);
    expect(arg.Attachments.map((a: any) => a.Name)).toEqual(["quote.pdf", "coi.pdf"]);
  });

  it("skips a stored attachment whose download fails, still sends", async () => {
    const { supabase } = makeSupabase({
      ...READY,
      attachments: [
        { file_name: "coi.pdf", storage_path: "p/coi.pdf", mime_type: "application/pdf" },
      ],
      download: { ok: false },
    });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({ sent: true });
    // Failed download skipped → no Attachments key (empty list).
    expect(mockSendEmail.mock.calls[0][0].Attachments).toBeUndefined();
  });
});

describe("resolveTriggerEmail — what the quote send preview shows", () => {
  it("returns the same sender, recipient, subject and body that sending uses, and sends nothing", async () => {
    const { supabase, inserted } = makeSupabase(READY);
    const r = await resolveTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
      recipientOverride: "a@x.com,b@x.com",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.email).toMatchObject({
      from: "Sam Rivera <sam@bleacherrentals.com>",
      to: "a@x.com,b@x.com",
      subject: "Hi Jordan",
    });
    expect(r.email.htmlBody).toContain("$10.00");
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(lastEmailLog(inserted)).toBeUndefined(); // previewing is not an attempt to send
  });

  it("explains why when the office has no active template", async () => {
    const { supabase } = makeSupabase({ ...READY, template: null });
    const r = await resolveTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toMatchObject({
      ok: false,
      reason: expect.stringContaining("No active email template"),
    });
  });
});
