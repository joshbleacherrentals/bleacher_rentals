import { decodeSnippet } from "./emailActivity";

// What a forward carries of the email it forwards: the usual "Forwarded message" block (who sent
// it, when, what it was about, who it went to) and the email's text, which goes into the box for
// the user to add a note above. Plain text only, since that is all the app sends.

/**
 * An email's HTML as plain text, for an email that has no text version: line breaks where blocks
 * and breaks were, tags and styles and scripts gone, entities turned back into characters. Not a
 * renderer: layout, links and images are lost.
 */
export function htmlToPlainText(html: string): string {
  const withBreaks = html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  return decodeSnippet(withBreaks)
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The text of a saved email: its text version, else its HTML as text, else nothing. */
export function forwardableText(email: {
  bodyText: string | null;
  bodyHtml: string | null;
}): string {
  if (email.bodyText?.trim()) return email.bodyText;
  return email.bodyHtml ? htmlToPlainText(email.bodyHtml) : "";
}

/** "Mon, Oct 26, 2026 at 10:00 AM": the way Gmail dates a forwarded message. */
export function forwardedDate(iso: string, timeZone?: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date
    .toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    })
    .replace(/ /g, " ")
    .replace(/, (\d{1,2}:\d{2} [AP]M)$/, " at $1");
}

/**
 * The block that opens a forward, ready to go into the box: two blank lines to type a note on, then
 * the "Forwarded message" header and the original text. The lines for Date and Cc are left out
 * when the email has none.
 */
export function forwardedMessageText(
  email: {
    from: string;
    /** ISO time, or null. */
    date: string | null;
    subject: string;
    to: string;
    cc: string;
    body: string;
  },
  timeZone?: string,
): string {
  const date = email.date ? forwardedDate(email.date, timeZone) : null;
  const lines = [
    "---------- Forwarded message ---------",
    `From: ${email.from}`,
    ...(date ? [`Date: ${date}`] : []),
    `Subject: ${email.subject}`,
    `To: ${email.to}`,
    ...(email.cc ? [`Cc: ${email.cc}`] : []),
    "",
    email.body.replace(/\r\n?/g, "\n").trim(),
  ];
  return `\n\n${lines.join("\n")}\n`;
}
