// A reply carries the earlier messages beneath the new text, quoted. Reading an email is easier with
// those folded away behind a small "•••" button, the way Gmail does it, so they are found here and
// wrapped in a <details>: a native disclosure that needs no script, which matters because the HTML
// body lives in a sandboxed iframe where scripts cannot run.
//
// Quotes are recognised by what the common mail programs write (Gmail, Apple Mail and Thunderbird,
// Yahoo, Proton, Outlook on the web). Anything not recognised is simply left showing.

const BUTTON = `<summary title="Show quoted text" aria-label="Show quoted text">&bull;&bull;&bull;</summary>`;

/** What a tag marks: a quote that is this element, or Outlook's marker, after which all is quoted. */
function quoteKind(tag: string): "element" | "to-end" | null {
  if (/\bid\s*=\s*["']?appendonsend\b/i.test(tag)) return "to-end";
  if (/\bclass\s*=\s*["'][^"']*(gmail_quote|yahoo_quoted|protonmail_quote)/i.test(tag)) {
    return "element";
  }
  if (/^<blockquote/i.test(tag) && /\btype\s*=\s*["']?cite\b/i.test(tag)) return "element";
  return null;
}

/** The index just past the `</tag>` that closes the `<tag>` opening at `start`, or -1 if none does. */
function endOfElement(html: string, start: number, tag: string): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/** Where an email's content stops: before its closing </body>, or the end of the markup. */
function endOfContent(html: string): number {
  const body = html.toLowerCase().lastIndexOf("</body");
  return body === -1 ? html.length : body;
}

/**
 * The email's HTML with each quoted section wrapped in `<details class="br-quote">` and a "•••"
 * summary, so it is folded until clicked. An email with no recognised quote comes back unchanged.
 */
export function collapseQuotedHtml(html: string): string {
  const opens = /<(div|blockquote)\b[^>]*>/gi;
  let out = "";
  let copied = 0; // html up to here is already in `out`

  for (let m = opens.exec(html); m; m = opens.exec(html)) {
    const kind = quoteKind(m[0]);
    if (!kind) continue;

    const end =
      kind === "to-end" ? endOfContent(html) : endOfElement(html, m.index, m[1].toLowerCase());
    if (end <= m.index) continue;

    out += `${html.slice(copied, m.index)}<details class="br-quote">${BUTTON}${html.slice(m.index, end)}</details>`;
    copied = end;
    opens.lastIndex = end; // what is inside is already folded
  }

  return out + html.slice(copied);
}

export type TextPart = { text: string; quoted: boolean };

const QUOTED_LINE = /^\s*>/;
const LEAD_IN_END = /(wrote|a écrit)\s*:\s*$/i; // "... wrote:" / "... a écrit :"
const LEAD_IN_START = /^\s*(On|Le)\s/i;

/** Outlook's "-----Original Message-----", or its line of underscores above a "From:" line. */
function startsQuotedRest(lines: string[], i: number): boolean {
  if (/^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i.test(lines[i])) return true;
  if (!/^_{20,}\s*$/.test(lines[i])) return false;
  const next = lines.slice(i + 1).find((line) => line.trim() !== "");
  return !!next && /^\s*From:/i.test(next);
}

/**
 * Splits a plain-text email into the text that is new and the text that is quoted: runs of lines
 * starting with ">" (with the "On ... wrote:" line above them), and anything after an Outlook
 * "Original Message" divider. Parts alternate, in order, so the email reads the same if joined.
 */
export function splitQuotedText(text: string): TextPart[] {
  const lines = text.split(/\r?\n/);
  const quoted = new Array<boolean>(lines.length).fill(false);

  for (let i = 0; i < lines.length; i++) {
    if (startsQuotedRest(lines, i)) {
      quoted.fill(true, i);
      break;
    }
    if (!QUOTED_LINE.test(lines[i])) continue;

    let end = i;
    while (end + 1 < lines.length && QUOTED_LINE.test(lines[end + 1])) end++;

    // The line that introduces the quote, which a mail program may have wrapped onto a second line
    // or separated from the quote by a blank one.
    let start = i;
    let lead = i - 1;
    if (lead >= 0 && lines[lead].trim() === "") lead--;
    if (lead >= 0 && LEAD_IN_END.test(lines[lead])) {
      start = lead;
      if (!LEAD_IN_START.test(lines[lead]) && lead > 0 && LEAD_IN_START.test(lines[lead - 1])) {
        start = lead - 1;
      }
    }

    quoted.fill(true, start, end + 1);
    i = end;
  }

  const parts: TextPart[] = [];
  lines.forEach((line, i) => {
    const last = parts[parts.length - 1];
    if (last && last.quoted === quoted[i]) last.text += `\n${line}`;
    else parts.push({ text: line, quoted: quoted[i] });
  });
  return parts;
}
