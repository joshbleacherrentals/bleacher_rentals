import { toEmailStatus, type EmailStatus } from "./emailStatus";

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
  /** 'success' for every email but one the app is still writing or sending, or could not send. */
  status: EmailStatus;
  /** Why sending failed, when status is 'error'. */
  errorText: string | null;
};

/** The fields of /api/gmail/contact-emails's `messages` that get saved. */
export type PulledEmail = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
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

/** An address header as one line per person, "Name <address>" or just the address, for a list. */
export function addressLines(header: string | null | undefined): string[] {
  return parseAddressList(header)
    .map((a) => (a.name && a.address ? `${a.name} <${a.address}>` : a.address || a.name || ""))
    .filter(Boolean);
}

/** "Name (address)", or just the address when there is no name. */
export function personWithAddress(person: Address): string {
  return person.name ? `${person.name} (${person.address})` : person.address;
}

/**
 * Who a reply to this email goes to: the sender of an email that came in, or, for one a colleague
 * wrote, the people it went to, so the reply reaches the other side. The user's own address is left
 * out unless it is the only one, and each address is listed once.
 */
export function replyRecipients(
  email: { direction: "sent" | "received"; fromHeader: string; toHeader: string },
  ownAddress: string | null,
): Address[] {
  const people = parseAddressList(
    email.direction === "sent" ? email.toHeader : email.fromHeader,
  ).filter((person) => person.address);
  const unique = people.filter(
    (person, i) =>
      people.findIndex((p) => p.address.toLowerCase() === person.address.toLowerCase()) === i,
  );

  const own = ownAddress?.trim().toLowerCase();
  const others = unique.filter((person) => person.address.toLowerCase() !== own);
  return others.length > 0 ? others : unique;
}

/**
 * Who a reply to everyone goes to. To is whoever a plain reply goes to (see replyRecipients) plus
 * everyone else the email went to; Cc is whoever it copied. The user's own address is left out of
 * both unless it is the only one in To, and each address is listed once, an address in To not
 * being repeated in Cc. People who were blind-copied are not known to the recipients, so they are
 * not here.
 */
export function replyAllRecipients(
  email: {
    direction: "sent" | "received";
    fromHeader: string;
    toHeader: string;
    ccHeader: string;
  },
  ownAddress: string | null,
): { to: Address[]; cc: Address[] } {
  const own = ownAddress?.trim().toLowerCase();
  const withAddress = (header: string) => parseAddressList(header).filter((p) => p.address);
  const notOwn = (people: Address[]) => people.filter((p) => p.address.toLowerCase() !== own);
  const unique = (people: Address[]) =>
    people.filter(
      (person, i) =>
        people.findIndex((p) => p.address.toLowerCase() === person.address.toLowerCase()) === i,
    );

  const to = unique([
    ...replyRecipients(email, ownAddress),
    ...notOwn(withAddress(email.toHeader)),
  ]);
  const inTo = new Set(to.map((person) => person.address.toLowerCase()));
  const cc = unique(notOwn(withAddress(email.ccHeader))).filter(
    (person) => !inTo.has(person.address.toLowerCase()),
  );
  return { to, cc };
}

// "Acme, Inc." is a company, not "Last, First".
const COMPANY_SUFFIX = /^\s*(inc|llc|ltd|limited|corp|corporation|co|incorporated)\b/i;

/**
 * The first and last name of a sender as `summarizeAddresses` shows them (a name, or an address when
 * there is no name), for an avatar's initials. A single word is only a first name; words that do not
 * start with a letter (a bracketed company, say) are skipped; an address uses what is before its @,
 * split at . _ and -.
 */
export function personNameParts(display: string): { firstName: string; lastName: string } {
  let name = display.trim();
  if (name.includes("@")) {
    name = name
      .split("@")[0]
      .split("+")[0]
      .replace(/[._-]+/g, " ");
  } else if (/^[^,]+,[^,]+$/.test(name)) {
    const [last, first] = name.split(",");
    if (!COMPANY_SUFFIX.test(first)) name = `${first} ${last}`;
  }

  const words = name
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((word) => /^\p{L}/u.test(word));
  return { firstName: words[0] ?? "", lastName: words.length > 1 ? words[words.length - 1] : "" };
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

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Gmail hands snippets back HTML-escaped (`isn&#39;t`), so they are saved that way. This turns the
 * entities back into characters for display, in one pass so `&amp;lt;` shows as `&lt;`. Anything it
 * does not recognize is left as it was.
 */
export function decodeSnippet(snippet: string): string {
  return snippet.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (entity, dec, hex, name) => {
    if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
    const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
  });
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
  status?: string | null;
  error_text?: string | null;
}): ActivityEmail {
  return {
    key: row.id,
    subject: row.subject?.trim() || "(no subject)",
    from: summarizeAddresses(row.from_address, 1) || "Unknown sender",
    to: summarizeAddresses(row.to_addresses),
    date: toIso(null, row.date),
    snippet: decodeSnippet(row.snippet ?? ""),
    direction: row.direction === "sent" ? "sent" : "received",
    status: toEmailStatus(row.status),
    errorText: row.error_text ?? null,
  };
}
