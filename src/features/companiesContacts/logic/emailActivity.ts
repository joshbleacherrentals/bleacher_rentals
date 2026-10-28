/** One email as the Activities list shows it, whether it came from our DB or straight from Gmail. */
export type ActivityEmail = {
  /** Stable key for the list. */
  key: string;
  subject: string;
  /** Who it is from, as a name (or address when there is no name). */
  from: string;
  /** Who it went to, shortened: "Ryan Verbuyst, Paul Hogendoorn +1". */
  to: string;
  /** ISO time, or null when the email had no usable date. */
  date: string | null;
  snippet: string;
  direction: "sent" | "received";
};

/** The fields of /api/dev/gmail-contact-emails's `messages` that get saved. */
export type PulledEmail = {
  messageId: string | null;
  /** Every mailbox holding a copy, with that mailbox's Gmail id. The first is the primary copy. */
  copies: { mailbox: string; id: string; threadId: string }[];
  from: string | null;
  to: string | null;
  cc: string | null;
  subject: string | null;
  date: string | null;
  /** When Google received it, in epoch milliseconds. */
  internalDate: number | null;
  snippet: string;
  direction: "sent" | "received";
};

type Address = { name: string | null; address: string };

/**
 * Splits an address header such as `Ryan <r@w.ca>, "Smith, Jo" <jo@x.com>, plain@y.com` into its
 * addresses. Commas inside quotes or angle brackets do not separate addresses.
 */
export function parseAddressList(header: string | null | undefined): Address[] {
  if (!header) return [];

  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  for (const ch of header) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === "<") inAngle = true;
    else if (!inQuotes && ch === ">") inAngle = false;

    if (ch === "," && !inQuotes && !inAngle) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): Address => {
      const match = part.match(/^(.*?)\s*<([^>]*)>$/);
      if (match) {
        const name = match[1]
          .trim()
          .replace(/^"(.*)"$/, "$1")
          .trim();
        return { name: name || null, address: match[2].trim() };
      }
      return part.includes("@")
        ? { name: null, address: part }
        : { name: part.replace(/^"(.*)"$/, "$1"), address: "" };
    });
}

function displayName(a: Address): string {
  return a.name || a.address;
}

/** "Ryan Verbuyst, Paul Hogendoorn +1": the first `max` people, then how many more. */
export function summarizeAddresses(header: string | null | undefined, max = 2): string {
  const people = parseAddressList(header).map(displayName);
  if (people.length <= max) return people.join(", ");
  return `${people.slice(0, max).join(", ")} +${people.length - max}`;
}

function toIso(ms: number | null, headerDate: string | null): string | null {
  if (ms !== null && Number.isFinite(ms)) return new Date(ms).toISOString();
  if (headerDate) {
    const parsed = new Date(headerDate);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

/** The time to save for a pulled email. Google's own receive time wins over the Date header, which can be missing or wrong. */
export function pulledEmailDate(email: Pick<PulledEmail, "internalDate" | "date">): string | null {
  return toIso(email.internalDate, email.date);
}

/** A row of EmailMessages (our DB), shaped for the list. */
export function storedToActivityEmail(row: {
  id: string;
  from_address: string | null;
  to_addresses: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  direction: string | null;
}): ActivityEmail {
  return {
    key: row.id,
    subject: row.subject?.trim() || "(no subject)",
    from: summarizeAddresses(row.from_address, 1) || "Unknown sender",
    to: summarizeAddresses(row.to_addresses),
    date: toIso(null, row.date),
    snippet: row.snippet ?? "",
    direction: row.direction === "sent" ? "sent" : "received",
  };
}
