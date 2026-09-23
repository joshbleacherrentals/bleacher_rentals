import type { SupabaseClient } from "@supabase/supabase-js";
import * as postmark from "postmark";
import {
  buildQuoteDocumentData,
  type QuoteDocumentData,
} from "@/features/quotesAndBookings/pdf/quoteDocumentData";
import { getTrigger } from "@/features/automaticEmails/triggers";
import {
  buildVariableValues,
  recipientEmail,
  renderTemplate,
} from "@/features/automaticEmails/variables";
import { logEmailSend } from "./logEmailSend";
import { PAYMENT_MADE_AM, QUOTE_SIGNED_AM } from "@/features/automaticEmails/triggers";

export type SendResult = { sent: true; to: string } | { sent: false; reason: string };

// Finance wants a copy of every account-manager notification for these two
// triggers. Hard-coded on purpose — this isn't a per-office setting yet.
const FINANCE_EMAIL = "finance@bleacherrentals.com";
const FINANCE_CC_TRIGGERS = new Set([QUOTE_SIGNED_AM, PAYMENT_MADE_AM]);

/**
 * Dispatch one automatic-email trigger for a booking.
 *
 * Server-only (service-role client — bypasses RLS; PowerSync is client-side).
 * Resolves the event's sales office, finds the (office, trigger) binding, and
 * if it's active with a template, substitutes variables and sends via Postmark.
 *
 * Best-effort: callers should wrap in try/catch and never fail their flow on a
 * send problem.
 */
export type EmailAttachment = {
  name: string;
  content: Buffer;
  contentType: string;
};

type ResolveOpts = {
  supabaseAdmin: SupabaseClient<any>;
  trigger: string;
  eventId: string;
  docData?: QuoteDocumentData | null;
  origin?: string;
  payment?: { amountPaidCents?: number; amountDueCents?: number; dueDate?: string };
  recipientOverride?: string;
};

export type ResolvedTriggerEmail = {
  templateId: string;
  from: string;
  to: string;
  cc: string | null;
  subject: string;
  htmlBody: string;
  storedAttachmentRows: {
    id: string;
    file_name: string;
    storage_path: string;
    mime_type: string | null;
  }[];
  docData: QuoteDocumentData;
};

export type ResolveResult =
  | { ok: true; email: ResolvedTriggerEmail }
  | { ok: false; reason: string; templateId: string | null };

/**
 * Everything about a trigger email except actually sending it: the office's active template with
 * variables substituted, the sender and the recipient. Shared by sending and by the quote send
 * preview, so what is previewed cannot drift from what goes out.
 */
export async function resolveTriggerEmail(opts: ResolveOpts): Promise<ResolveResult> {
  const { supabaseAdmin, trigger, eventId } = opts;
  const fail = (reason: string, templateId: string | null = null): ResolveResult => ({
    ok: false,
    reason,
    templateId,
  });

  const def = getTrigger(trigger);
  if (!def) return fail(`Unknown trigger type: "${trigger}" — this is a code error`);
  if (!def.wired) return fail("This trigger is not yet active (coming soon)");

  const apiKey = process.env.POSTMARK_API_KEY;
  const fromEmail = process.env.POSTMARK_FROM_EMAIL;
  if (!apiKey || !fromEmail || apiKey === "your_postmark_api_key_here") {
    return fail("Email sending is not configured — missing Postmark credentials");
  }

  // Which office does this event belong to?
  const { data: event } = await supabaseAdmin
    .from("Events")
    .select("sales_office_uuid")
    .eq("id", eventId)
    .maybeSingle();
  const salesOfficeUuid = event?.sales_office_uuid;
  if (!salesOfficeUuid) return fail("This event has no sales office assigned");

  // Find the office's binding for this trigger.
  const { data: binding } = await supabaseAdmin
    .from("EmailTriggerBindings")
    .select("id")
    .eq("sales_office_uuid", salesOfficeUuid)
    .eq("trigger", trigger)
    .maybeSingle();

  if (!binding) return fail("No email template has been set up for this trigger in this office");

  // The active template is tracked on EmailTemplates (is_active = true), not
  // via a FK on the binding. Find whichever template is currently active.
  const { data: template } = await supabaseAdmin
    .from("EmailTemplates")
    .select("id, subject, html_body")
    .eq("trigger_uuid", binding.id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (!template)
    return fail("No active email template — activate one in Email Automation settings");

  // Resolve booking data (reuse a prebuilt doc when provided).
  const docData = opts.docData ?? (await buildQuoteDocumentData(eventId, opts.origin ?? ""));
  if (!docData) return fail("Could not load event data needed to send this email", template.id);

  const recipient = opts.recipientOverride?.trim() || recipientEmail(docData, def.recipient);
  if (!recipient) return fail("No recipient email address found for this event", template.id);

  const values = buildVariableValues(docData, opts.payment);
  const subject =
    renderTemplate(template.subject || "", values).trim() ||
    `${def.label} — ${docData.quoteNumber}`;
  const htmlBody = renderTemplate(template.html_body || "", values);

  const { data: storedAttachmentRows } = await supabaseAdmin
    .from("EmailTemplateAttachments")
    .select("id, file_name, storage_path, mime_type")
    .eq("template_id", template.id)
    .order("created_at", { ascending: true });

  // Client-facing emails send as the account manager; internal (AM) emails send
  // from the default address.
  const senderEmail =
    def.recipient === "client" ? (docData.accountManagerEmail ?? fromEmail) : fromEmail;
  const from =
    def.recipient === "client" && docData.accountManager
      ? `${docData.accountManager} <${senderEmail}>`
      : senderEmail;

  return {
    ok: true,
    email: {
      templateId: template.id,
      from,
      to: recipient,
      cc: FINANCE_CC_TRIGGERS.has(trigger) ? FINANCE_EMAIL : null,
      subject,
      htmlBody,
      storedAttachmentRows: storedAttachmentRows ?? [],
      docData,
    },
  };
}

export async function sendTriggerEmail(opts: {
  supabaseAdmin: SupabaseClient<any>;
  trigger: string;
  eventId: string;
  // Pass a prebuilt doc to avoid re-rendering; otherwise it's fetched.
  docData?: QuoteDocumentData | null;
  origin?: string;
  payment?: { amountPaidCents?: number; amountDueCents?: number; dueDate?: string };
  // Optional file attachments forwarded directly to Postmark.
  attachments?: EmailAttachment[];
  // Override the resolved recipient (e.g. to CC a finance contact).
  recipientOverride?: string;
}): Promise<SendResult> {
  const { supabaseAdmin, trigger, eventId } = opts;

  // Always log the outcome before returning so every fire attempt is recorded
  // in EventEmailLog, whether it succeeded or failed.
  const resolve = (result: SendResult, templateId: string | null): Promise<SendResult> =>
    logEmailSend(supabaseAdmin, { eventId, trigger, result, templateId }).then(() => result);

  const resolved = await resolveTriggerEmail(opts);
  if (!resolved.ok) return resolve({ sent: false, reason: resolved.reason }, resolved.templateId);
  const { email } = resolved;

  const storedAttachments: EmailAttachment[] = [];
  for (const row of email.storedAttachmentRows) {
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from("email-attachments")
      .download(row.storage_path);
    if (downloadError || !fileData) {
      console.warn(
        `sendTriggerEmail: could not download attachment ${row.storage_path}:`,
        downloadError?.message,
      );
      continue;
    }
    storedAttachments.push({
      name: row.file_name,
      content: Buffer.from(await fileData.arrayBuffer()),
      contentType: row.mime_type ?? "application/octet-stream",
    });
  }

  // Merge caller-supplied attachments (e.g. the quote PDF) with stored ones.
  const allAttachments = [...(opts.attachments ?? []), ...storedAttachments];

  const client = new postmark.ServerClient(process.env.POSTMARK_API_KEY!);
  await client.sendEmail({
    From: email.from,
    To: email.to,
    ...(email.cc ? { Cc: email.cc } : {}),
    Subject: email.subject,
    HtmlBody: email.htmlBody,
    MessageStream: "outbound",
    ...(allAttachments.length
      ? {
          Attachments: allAttachments.map((a) => ({
            Name: a.name,
            Content: a.content.toString("base64"),
            ContentType: a.contentType,
            ContentID: "",
          })),
        }
      : {}),
  });

  return resolve({ sent: true, to: email.to }, email.templateId);
}
