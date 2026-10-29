// What a reply needs from the email it answers, so the reply lands in the same conversation: a
// "Re:" subject, and a References header that lists the conversation so far and then that email.

// The Message-IDs in a header, in their own case: a mail program matches them exactly, so unlike the
// thread rules (emailThread.ts) these are never lower-cased.
const idsIn = (header: string | null | undefined) => header?.match(/<[^<>\s]+>/g) ?? [];

// RFC 5322 advises against a References header that keeps growing: a very long conversation keeps
// its first email and the most recent ones.
const MAX_REFERENCES = 30;

/** Which button opened a reply: Reply (the sender) or Reply all (everyone on the email). */
export type ReplyMode = "reply" | "replyAll";

/** "Re: Quote" for "Quote"; a subject that already starts with Re: is left as it is. */
export function replySubject(subject: string): string {
  const trimmed = subject.trim();
  if (/^re\s*:/i.test(trimmed)) return trimmed;
  return trimmed ? `Re: ${trimmed}` : "Re:";
}

/**
 * The References header for a reply to `parent`: the IDs of the conversation so far, then the
 * parent's own. Null when the parent has neither.
 */
export function replyReferences(parent: {
  messageId: string | null;
  references: string | null;
}): string | null {
  const ids = [...idsIn(parent.references), ...idsIn(parent.messageId)];
  const unique = ids.filter((id, i) => ids.indexOf(id) === i);
  if (unique.length === 0) return null;

  const kept =
    unique.length > MAX_REFERENCES ? [unique[0], ...unique.slice(-(MAX_REFERENCES - 1))] : unique;
  return kept.join(" ");
}
