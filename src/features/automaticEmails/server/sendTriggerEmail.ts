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
  let templateId: string | null = null;

  // Always log the outcome before returning so every fire attempt is recorded
  // in EventEmailLog, whether it succeeded or failed.
  const resolve = (result: SendResult): Promise<SendResult> => {
    return logEmailSend(supabaseAdmin, { eventId, trigger, result, templateId }).then(() => result);
  };

  const def = getTrigger(trigger);
  if (!def)
    return resolve({
      sent: false,
      reason: `Unknown trigger type: "${trigger}" — this is a code error`,
    });
  if (!def.wired)
    return resolve({ sent: false, reason: "This trigger is not yet active (coming soon)" });

  const apiKey = process.env.POSTMARK_API_KEY;
  const fromEmail = process.env.POSTMARK_FROM_EMAIL;
  if (!apiKey || !fromEmail || apiKey === "your_postmark_api_key_here") {
    return resolve({
      sent: false,
      reason: "Email sending is not configured — missing Postmark credentials",
    });
  }

  // Which office does this event belong to?
  const { data: event } = await supabaseAdmin
    .from("Events")
    .select("sales_office_uuid")
    .eq("id", eventId)
    .maybeSingle();
  const salesOfficeUuid = event?.sales_office_uuid;
  if (!salesOfficeUuid)
    return resolve({ sent: false, reason: "This event has no sales office assigned" });

  // Find the office's binding for this trigger.
  const { data: binding } = await supabaseAdmin
    .from("EmailTriggerBindings")
    .select("id")
    .eq("sales_office_uuid", salesOfficeUuid)
    .eq("trigger", trigger)
    .maybeSingle();

  if (!binding)
    return resolve({
      sent: false,
      reason: "No email template has been set up for this trigger in this office",
    });

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
    return resolve({
      sent: false,
      reason: "No active email template — activate one in Email Automation settings",
    });

  templateId = template.id;

  // Resolve booking data (reuse a prebuilt doc when provided).
  const docData = opts.docData ?? (await buildQuoteDocumentData(eventId, opts.origin ?? ""));
  if (!docData)
    return resolve({ sent: false, reason: "Could not load event data needed to send this email" });

  const recipient = opts.recipientOverride?.trim() || recipientEmail(docData, def.recipient);
  if (!recipient)
    return resolve({ sent: false, reason: "No recipient email address found for this event" });

  const values = buildVariableValues(docData, opts.payment);
  const subject =
    renderTemplate(template.subject || "", values).trim() ||
    `${def.label} — ${docData.quoteNumber}`;
  const htmlBody = renderTemplate(template.html_body || "", values);

  // Fetch stored attachments for this template from Supabase storage.
  const { data: storedAttachmentRows } = await supabaseAdmin
    .from("EmailTemplateAttachments")
    .select("id, file_name, storage_path, mime_type")
    .eq("template_id", template.id)
    .order("created_at", { ascending: true });

  const storedAttachments: EmailAttachment[] = [];
  for (const row of storedAttachmentRows ?? []) {
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

  // Client-facing emails send as the account manager; internal (AM) emails send
  // from the default address.
  const senderEmail =
    def.recipient === "client" ? (docData.accountManagerEmail ?? fromEmail) : fromEmail;
  const senderFrom =
    def.recipient === "client" && docData.accountManager
      ? `${docData.accountManager} <${senderEmail}>`
      : senderEmail;

  const client = new postmark.ServerClient(apiKey);
  await client.sendEmail({
    From: senderFrom,
    To: recipient,
    ...(FINANCE_CC_TRIGGERS.has(trigger) ? { Cc: FINANCE_EMAIL } : {}),
    Subject: subject,
    HtmlBody: htmlBody,
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

  return resolve({ sent: true, to: recipient });
}
