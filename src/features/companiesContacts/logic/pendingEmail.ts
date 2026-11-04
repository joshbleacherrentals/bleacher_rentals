// What a reply looks like in the database the moment Send is pressed, before Gmail has seen it.
// Everything the writer knows is filled in; what only Gmail can say (its ids, its own snippet, its
// date) is left empty, and the server fills it in once the email is sent (see unsentEmail.ts).

/** How much of the text becomes the snippet. Gmail's own is about this long. */
const SNIPPET_LENGTH = 100;

export type PendingEmailInput = {
  /** New ids for the EmailMessages row, its link to the contact and its body. */
  ids: { message: string; link: string; details: string };
  /** When it was written, as an ISO time. */
  now: string;
  contactUuid: string;
  /** The signed-in user: the email goes out from, and is saved in, their mailbox. */
  sender: { address: string; name: string | null };
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  /** The Message-ID of the email being answered, and the Message-IDs before it. */
  inReplyTo: string | null;
  references: string | null;
};

export type PendingEmail = {
  message: {
    id: string;
    created_at: string;
    mailbox: string;
    google_message_id: null;
    google_id: null;
    google_thread_id: null;
    google_in_reply_to: string | null;
    google_references: string | null;
    from_address: string;
    to_addresses: string | null;
    cc_addresses: string | null;
    subject: string;
    date: string;
    snippet: string;
    direction: "sent";
    status: "sending";
    error_text: null;
  };
  link: { id: string; created_at: string; contact_uuid: string; email_message_uuid: string };
  details: {
    id: string;
    created_at: string;
    email_message_uuid: string;
    body_text: string;
    body_html: null;
  };
};

/** `"Name" <address>`, or just the address: the way Gmail returns the From of an email we send. */
export function fromHeader(sender: { address: string; name: string | null }): string {
  const name = sender.name?.trim();
  return name ? `"${name.replace(/(["\\])/g, "\\$1")}" <${sender.address}>` : sender.address;
}

/** The start of the text on one line, as the list shows it. Close to Gmail's, never exactly it. */
export function pendingSnippet(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, SNIPPET_LENGTH);
}

/** The rows to save at once when a reply is sent: the email, its link to the contact, its body. */
export function buildPendingEmail(input: PendingEmailInput): PendingEmail {
  const mailbox = input.sender.address.trim().toLowerCase();
  const { message: id } = input.ids;

  return {
    message: {
      id,
      created_at: input.now,
      mailbox,
      google_message_id: null,
      google_id: null,
      google_thread_id: null,
      google_in_reply_to: input.inReplyTo,
      google_references: input.references,
      from_address: fromHeader({ name: input.sender.name, address: mailbox }),
      to_addresses: input.to.length > 0 ? input.to.join(", ") : null,
      cc_addresses: input.cc.length > 0 ? input.cc.join(", ") : null,
      subject: input.subject,
      date: input.now,
      snippet: pendingSnippet(input.text),
      direction: "sent",
      status: "sending",
      error_text: null,
    },
    link: {
      id: input.ids.link,
      created_at: input.now,
      contact_uuid: input.contactUuid,
      email_message_uuid: id,
    },
    details: {
      id: input.ids.details,
      created_at: input.now,
      email_message_uuid: id,
      body_text: input.text,
      body_html: null,
    },
  };
}
