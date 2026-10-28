// Which saved emails belong to the same conversation as one that is open. Only emails already saved
// (the ones that involve the contact) are considered, never the whole Gmail thread, so what the
// Blocked Emails list and the contact search keep out of the database stays out of a thread.
//
// An email's Message-ID is its own name tag, shared by every mailbox's copy. Its References header
// lists the name tags of everything before it, starting with the email that began the conversation,
// so that first one is the same on every reply and names the thread.

/** The columns of EmailMessages that decide a thread, plus what a row of the thread shows. */
export type ThreadRow = {
  id: string;
  mailbox: string | null;
  google_message_id: string | null;
  google_thread_id: string | null;
  google_in_reply_to: string | null;
  google_references: string | null;
  from_address: string | null;
  to_addresses: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  direction: string | null;
};

type HeaderIds = Pick<ThreadRow, "google_message_id" | "google_in_reply_to" | "google_references">;

/** The Message-IDs in a header such as `<a@x> <b@x>`, lowercased, in order. */
export function messageIdsIn(header: string | null | undefined): string[] {
  if (!header) return [];
  const bracketed = header.match(/<[^>\s]+>/g);
  if (bracketed) return bracketed.map((id) => id.toLowerCase());
  const bare = header.trim().toLowerCase();
  return bare ? [bare] : [];
}

/**
 * The Message-ID of the email that started this one's thread: the first in References, else the
 * email it replies to, else itself. Null for an email saved without any of them.
 */
export function threadRoot(row: HeaderIds): string | null {
  return (
    messageIdsIn(row.google_references)[0] ??
    messageIdsIn(row.google_in_reply_to)[0] ??
    messageIdsIn(row.google_message_id)[0] ??
    null
  );
}

const timeOf = (row: ThreadRow) => {
  const time = row.date ? Date.parse(row.date) : NaN;
  return Number.isNaN(time) ? -Infinity : time;
};

/**
 * The emails of `openedId`'s thread out of `rows`, oldest first. An email is in the thread when it
 * has the same root, or, for emails saved before the headers were kept, the same Gmail thread in the
 * same mailbox (Gmail's thread ids belong to one mailbox, so they are never compared across
 * mailboxes). An email in several mailboxes is listed once, as the opened copy if it is that one.
 * Empty when the opened email is not among `rows`.
 */
export function selectThread(openedId: string, rows: ThreadRow[]): ThreadRow[] {
  const opened = rows.find((row) => row.id === openedId);
  if (!opened) return [];

  const root = threadRoot(opened);
  const inThread = rows.filter(
    (row) =>
      row.id === opened.id ||
      (root !== null && threadRoot(row) === root) ||
      (row.mailbox === opened.mailbox &&
        row.google_thread_id !== null &&
        row.google_thread_id === opened.google_thread_id),
  );

  // One entry per email: the opened copy, else the copy with the lowest id.
  const byEmail = new Map<string, ThreadRow>();
  for (const row of [...inThread].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const key = messageIdsIn(row.google_message_id)[0] ?? `row:${row.id}`;
    const kept = byEmail.get(key);
    if (!kept || row.id === opened.id) byEmail.set(key, row);
  }

  return [...byEmail.values()].sort(
    (a, b) => timeOf(a) - timeOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
