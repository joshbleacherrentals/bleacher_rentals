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

type LoadParams = { emailMessageUuid: string; mailbox: string; googleId: string };

async function fetchAndSaveDetails(params: LoadParams): Promise<void> {
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

// Loads in progress, by email. The open email and a forward of it can both ask for its body at the
// same moment; the second asks the first rather than fetching and saving it again, which would
// leave two bodies for one email.
const inFlight = new Map<string, Promise<void>>();

/**
 * Loads an email's body from Gmail the first time it is needed and saves it. `mailbox` and
 * `googleId` say which mailbox's copy to read (EmailMessages.mailbox and .google_id). Does nothing
 * when the details are already saved, and a second call while the first is still running waits for
 * it instead of loading again, so the body is never saved twice.
 */
export function loadEmailDetails(params: LoadParams): Promise<void> {
  const running = inFlight.get(params.emailMessageUuid);
  if (running) return running;

  const load = fetchAndSaveDetails(params).finally(() => {
    inFlight.delete(params.emailMessageUuid);
  });
  inFlight.set(params.emailMessageUuid, load);
  return load;
}
