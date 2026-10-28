import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecuteBatch, typedGetAll } from "@/lib/powersync/typedQuery";

/**
 * Saves an email's body (EmailMessageDetails) and points the EmailMessages row at it, in one local
 * transaction. The details row goes first so the pointer never refers to a row that is not there yet
 * when PowerSync uploads them in order. Returns the new details id.
 */
export async function saveEmailDetails(params: {
  emailMessageUuid: string;
  bodyText: string | null;
  bodyHtml: string | null;
}): Promise<string> {
  const id = crypto.randomUUID();

  await typedExecuteBatch([
    db
      .insertInto("EmailMessageDetails")
      .values({
        id,
        created_at: new Date().toISOString(),
        email_message_uuid: params.emailMessageUuid,
        body_text: params.bodyText,
        body_html: params.bodyHtml,
      })
      .compile(),
    db
      .updateTable("EmailMessages")
      .set({ email_message_details_uuid: id })
      .where("id", "=", params.emailMessageUuid)
      .compile(),
  ]);

  return id;
}

/**
 * Loads an email's body from Gmail the first time it is opened and saves it. `mailbox` and
 * `googleId` say which mailbox's copy to read (EmailMessages.mailbox and .google_id). Does nothing
 * when the details are already saved, so two quick opens cannot save them twice.
 */
export async function loadEmailDetails(params: {
  emailMessageUuid: string;
  mailbox: string;
  googleId: string;
}): Promise<void> {
  const existing = await typedGetAll(
    db
      .selectFrom("EmailMessageDetails")
      .select(["id"])
      .where("email_message_uuid", "=", params.emailMessageUuid)
      .compile(),
    expect<{ id: string }>(),
  );
  if (existing.length > 0) return;

  const res = await fetch(
    `/api/dev/gmail-email?mailbox=${encodeURIComponent(params.mailbox)}&id=${encodeURIComponent(params.googleId)}`,
  );
  const body: { error?: string; text?: string | null; html?: string | null } | null = await res
    .json()
    .catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Could not load the email (${res.status}).`);

  await saveEmailDetails({
    emailMessageUuid: params.emailMessageUuid,
    bodyText: body?.text ?? null,
    bodyHtml: body?.html ?? null,
  });
}
