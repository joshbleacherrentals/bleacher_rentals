import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { QuoteDocumentData } from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import {
  QUOTE_SENT_CLIENT,
  QUOTE_SIGNED_CLIENT,
  QUOTE_SIGNED_AM,
  PAYMENT_MADE_CLIENT,
  PAYMENT_MADE_AM,
} from "../triggers";

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
  attachments?: Array<{
    id?: string;
    file_name: string;
    storage_path: string;
    mime_type: string | null;
  }>;
  download?: { ok: boolean };
  // Rows of DevAllowedEmails, or an error reading them.
  allowedEmails?: string[];
  allowedEmailsError?: { message: string };
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
        select: () =>
          table === "DevAllowedEmails"
            ? Promise.resolve({
                data: cfg.allowedEmailsError
                  ? null
                  : (cfg.allowedEmails ?? []).map((email) => ({ email })),
                error: cfg.allowedEmailsError ?? null,
              })
            : builder,
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

describe("finance copy", () => {
  it.each([QUOTE_SIGNED_AM, PAYMENT_MADE_AM])(
    "CCs finance on the account manager's %s email",
    async (trigger) => {
      const { supabase } = makeSupabase(READY);
      await sendTriggerEmail({ supabaseAdmin: supabase, trigger, eventId: "e1", docData: doc() });
      expect(mockSendEmail.mock.calls[0][0].Cc).toBe("finance@bleacherrentals.com");
    },
  );

  it("does not CC finance on an email that is already addressed to finance", async () => {
    const { supabase } = makeSupabase(READY);
    await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_AM,
      eventId: "e1",
      docData: doc(),
      recipientOverride: "finance@bleacherrentals.com",
    });
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent.To).toBe("finance@bleacherrentals.com");
    expect(sent).not.toHaveProperty("Cc");
  });

  it.each([QUOTE_SENT_CLIENT, QUOTE_SIGNED_CLIENT, PAYMENT_MADE_CLIENT])(
    "does not CC finance on the client's %s email",
    async (trigger) => {
      const { supabase } = makeSupabase(READY);
      await sendTriggerEmail({ supabaseAdmin: supabase, trigger, eventId: "e1", docData: doc() });
      expect(mockSendEmail.mock.calls[0][0]).not.toHaveProperty("Cc");
    },
  );
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

describe("development email allowlist", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "development");
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    errorSpy.mockRestore();
  });

  it("sends to an allowed recipient and drops the finance CC that is not on the list", async () => {
    const { supabase, inserted } = makeSupabase({
      ...READY,
      allowedEmails: ["sam@bleacherrentals.com"],
    });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_AM,
      eventId: "e1",
      docData: doc(),
    });
    expect(r).toEqual({ sent: true, to: "sam@bleacherrentals.com" });
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent.To).toBe("sam@bleacherrentals.com");
    expect(sent).not.toHaveProperty("Cc");
    expect(lastEmailLog(inserted)).toMatchObject({ status: "sent" });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("finance@bleacherrentals.com"));
  });

  it("does not send when the recipient is not on the list, and says why in the email log", async () => {
    const { supabase, inserted } = makeSupabase({ ...READY, allowedEmails: [] });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      sent: false,
      reason: expect.stringContaining("jordan@example.com"),
    });
    expect(lastEmailLog(inserted)).toMatchObject({
      status: "failed",
      reason: expect.stringContaining("/dev-tools/allowed-emails"),
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("jordan@example.com"));
  });

  it("does not send when the allowlist cannot be read", async () => {
    const { supabase } = makeSupabase({
      ...READY,
      allowedEmailsError: { message: "boom" },
    });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(r.sent).toBe(false);
  });

  it.each(["staging", "production", undefined])(
    "changes nothing when NEXT_PUBLIC_ENVIRONMENT is %j: the empty list is never consulted",
    async (env) => {
      vi.unstubAllEnvs();
      if (env) vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", env);
      const { supabase } = makeSupabase({ ...READY, allowedEmails: [] });
      const r = await sendTriggerEmail({
        supabaseAdmin: supabase,
        trigger: QUOTE_SIGNED_AM,
        eventId: "e1",
        docData: doc(),
      });
      expect(r).toEqual({ sent: true, to: "sam@bleacherrentals.com" });
      expect(mockSendEmail.mock.calls[0][0].Cc).toBe("finance@bleacherrentals.com");
    },
  );

  it("does not filter the send preview, which sends nothing", async () => {
    const { supabase } = makeSupabase({ ...READY, allowedEmails: [] });
    const r = await resolveTriggerEmail({
      supabaseAdmin: supabase,
      trigger: QUOTE_SIGNED_CLIENT,
      eventId: "e1",
      docData: doc(),
    });
    expect(r.ok).toBe(true);
  });
});

describe("quote send options: cc, bcc, subject, omitted attachments", () => {
  const base = { trigger: QUOTE_SIGNED_CLIENT, eventId: "e1" };

  it("sends Cc, Bcc and a custom subject, and logs them", async () => {
    const { supabase, inserted } = makeSupabase(READY);
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      ...base,
      docData: doc(),
      recipientOverride: "a@x.com",
      cc: ["c1@x.com", "c2@x.com"],
      bcc: ["b@x.com"],
      subject: "  Custom  ",
    });
    expect(r).toEqual({ sent: true, to: "a@x.com" });
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent).toMatchObject({
      To: "a@x.com",
      Cc: "c1@x.com, c2@x.com",
      Bcc: "b@x.com",
      Subject: "Custom",
    });
    expect(lastEmailLog(inserted)).toMatchObject({
      status: "sent",
      to_email: "a@x.com",
      cc_emails: "c1@x.com, c2@x.com",
      bcc_emails: "b@x.com",
      subject: "Custom",
    });
  });

  it("an empty subject sends the template's subject", async () => {
    const { supabase, inserted } = makeSupabase(READY);
    await sendTriggerEmail({ supabaseAdmin: supabase, ...base, docData: doc(), subject: "   " });
    expect(mockSendEmail.mock.calls[0][0].Subject).toBe("Hi Jordan");
    expect(lastEmailLog(inserted)?.subject).toBe("Hi Jordan");
  });

  it("an empty subject and an empty template subject fall back to the trigger name and quote number", async () => {
    const { supabase } = makeSupabase({
      ...READY,
      template: { id: "t-1", subject: "", html_body: "<p>x</p>" },
    });
    await sendTriggerEmail({ supabaseAdmin: supabase, ...base, docData: doc(), subject: "" });
    expect(mockSendEmail.mock.calls[0][0].Subject).toMatch(/Q-1$/);
  });

  it("sends an address that is in several fields once, as the first of To, Cc, Bcc", async () => {
    const { supabase } = makeSupabase(READY);
    await sendTriggerEmail({
      supabaseAdmin: supabase,
      ...base,
      docData: doc(),
      recipientOverride: "a@x.com",
      cc: ["A@x.com", "c@x.com"],
      bcc: ["C@x.com", "b@x.com", "a@x.com"],
    });
    const sent = mockSendEmail.mock.calls[0][0];
    expect(sent).toMatchObject({ To: "a@x.com", Cc: "c@x.com", Bcc: "b@x.com" });
  });

  it("leaves out the omitted template attachments but keeps caller ones, and logs the names", async () => {
    const { supabase, inserted } = makeSupabase({
      ...READY,
      attachments: [
        { id: "r1", file_name: "faq.pdf", storage_path: "p/faq.pdf", mime_type: null },
        { id: "r2", file_name: "coi.pdf", storage_path: "p/coi.pdf", mime_type: null },
      ],
      download: { ok: true },
    });
    await sendTriggerEmail({
      supabaseAdmin: supabase,
      ...base,
      docData: doc(),
      attachments: [{ name: "Q-1.pdf", content: Buffer.from("x"), contentType: "application/pdf" }],
      omitAttachmentKeys: ["r1", "quote_pdf"],
    });
    const names = mockSendEmail.mock.calls[0][0].Attachments.map((a: any) => a.Name);
    expect(names).toEqual(["Q-1.pdf", "coi.pdf"]);
    expect(lastEmailLog(inserted)?.attachment_names).toBe("Q-1.pdf, coi.pdf");
  });

  it("when Postmark rejects the message, returns a failed result and logs it with the details", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockSendEmail.mockRejectedValue(new Error("Invalid 'To' address: 'x@y'"));
    const { supabase, inserted } = makeSupabase({
      ...READY,
      attachments: [{ id: "r1", file_name: "terms.pdf", storage_path: "p", mime_type: null }],
      download: { ok: true },
    });
    const r = await sendTriggerEmail({
      supabaseAdmin: supabase,
      ...base,
      docData: doc(),
      recipientOverride: "a@x.com",
      cc: ["c@x.com"],
      bcc: ["b@x.com"],
      subject: "Hello",
      attachments: [{ name: "Q-1.pdf", content: Buffer.from("x"), contentType: "application/pdf" }],
    });
    expect(r).toMatchObject({ sent: false, postmarkException: true });
    expect((r as { reason: string }).reason).toMatch(/Invalid 'To' address/);
    expect(lastEmailLog(inserted)).toMatchObject({
      status: "failed",
      cc_emails: "c@x.com",
      bcc_emails: "b@x.com",
      subject: "Hello",
      attachment_names: "Q-1.pdf, terms.pdf",
    });
    expect(lastEmailLog(inserted).reason).toMatch(/Invalid 'To' address/);
    errorSpy.mockRestore();
  });

  describe("development allowlist", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      vi.stubEnv("NEXT_PUBLIC_ENVIRONMENT", "development");
      errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      errorSpy.mockRestore();
    });

    it("drops a Bcc that is not on the list, keeps an allowed one", async () => {
      const { supabase, inserted } = makeSupabase({
        ...READY,
        allowedEmails: ["a@x.com", "okbcc@x.com"],
      });
      await sendTriggerEmail({
        supabaseAdmin: supabase,
        ...base,
        docData: doc(),
        recipientOverride: "a@x.com",
        bcc: ["okbcc@x.com", "secret@x.com"],
      });
      const sent = mockSendEmail.mock.calls[0][0];
      expect(sent.Bcc).toBe("okbcc@x.com");
      expect(lastEmailLog(inserted)?.bcc_emails).toBe("okbcc@x.com");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("secret@x.com"));
    });

    it("sends no Bcc at all when none of them is allowed", async () => {
      const { supabase } = makeSupabase({ ...READY, allowedEmails: ["a@x.com"] });
      await sendTriggerEmail({
        supabaseAdmin: supabase,
        ...base,
        docData: doc(),
        recipientOverride: "a@x.com",
        bcc: ["secret@x.com"],
      });
      expect(mockSendEmail.mock.calls[0][0]).not.toHaveProperty("Bcc");
    });

    it("refuses the send when To ends empty, even if the Bcc is allowed", async () => {
      const { supabase } = makeSupabase({ ...READY, allowedEmails: ["okbcc@x.com"] });
      const r = await sendTriggerEmail({
        supabaseAdmin: supabase,
        ...base,
        docData: doc(),
        recipientOverride: "a@x.com",
        bcc: ["okbcc@x.com"],
      });
      expect(r.sent).toBe(false);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
