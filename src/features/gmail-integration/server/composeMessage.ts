// Builds the message Gmail is asked to send: plain UTF-8 text with a From, To, Cc, Bcc, Subject and
// the reply headers, as the base64url string `users.messages.send` takes. Every value that goes into
// a header is checked or cleaned here as well as by the request check (sendRequest.ts), so no
// input can add a header or a recipient of its own.

export type OutgoingEmail = {
  from: { name: string | null; address: string };
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  text: string;
  /** The Message-ID of the email being answered, as saved: `<id@host>`. */
  inReplyTo: string | null;
  /** Message-IDs, space separated: the conversation so far. */
  references: string | null;
};

// One plain address: no name, no angle brackets, no list separators, no spaces or line breaks.
const ADDRESS = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;

function address(value: string): string {
  if (!ADDRESS.test(value)) {
    throw new Error(`Not a plain email address: ${JSON.stringify(value)}`);
  }
  return value;
}

/** A value for one header line: any line break becomes a space. */
const oneLine = (value: string) => value.replace(/\s*[\r\n]+\s*/g, " ").trim();

// An RFC 2047 encoded word is at most 75 characters; 45 bytes of text is 60 of base64 plus the 12
// of "=?UTF-8?B?" and "?=".
const MAX_WORD_BYTES = 45;

/** Text for a header: as it is when plain ASCII, else as encoded words, folded onto more lines. */
function headerText(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;

  const words: string[] = [];
  let chunk: number[] = [];
  const flush = () => {
    if (chunk.length > 0) words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
    chunk = [];
  };
  for (const character of value) {
    const bytes = Buffer.from(character, "utf8");
    if (chunk.length + bytes.length > MAX_WORD_BYTES) flush();
    chunk.push(...bytes);
  }
  flush();
  return words.join("\r\n ");
}

function sender(from: OutgoingEmail["from"]): string {
  const mailbox = address(from.address);
  const name = from.name ? oneLine(from.name).replace(/["\\]/g, "") : "";
  if (!name) return mailbox;
  return /^[\x20-\x7e]*$/.test(name)
    ? `"${name}" <${mailbox}>`
    : `${headerText(name)} <${mailbox}>`;
}

const idsIn = (header: string | null) => header?.match(/<[^<>\s]+>/g) ?? [];

/** The message, ready for the Gmail API. Throws if an address is not a plain email address. */
export function buildRawMessage(email: OutgoingEmail): string {
  const headers = [
    `From: ${sender(email.from)}`,
    `To: ${email.to.map(address).join(", ")}`,
    ...(email.cc.length > 0 ? [`Cc: ${email.cc.map(address).join(", ")}`] : []),
    ...(email.bcc.length > 0 ? [`Bcc: ${email.bcc.map(address).join(", ")}`] : []),
    `Subject: ${headerText(oneLine(email.subject))}`,
  ];

  const [inReplyTo] = idsIn(email.inReplyTo);
  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  const references = idsIn(email.references);
  if (references.length > 0) headers.push(`References: ${references.join(" ")}`);

  headers.push(
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  );

  // CRLF line breaks, then base64 in lines of at most 76 characters.
  const body = Buffer.from(email.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64");
  const wrapped = body.match(/.{1,76}/g)?.join("\r\n") ?? "";

  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${wrapped}`, "utf8").toString("base64url");
}
