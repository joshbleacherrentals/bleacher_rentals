// An email's HTML is written by a stranger, so it is never put in the page itself. It goes into a
// sandboxed iframe with an opaque origin (no access to our page or cookies) whose document also
// carries a Content-Security-Policy that blocks everything remote: no tracking pixels, no external
// images, styles or fonts. Inline styles and data: images still work. This is not a sanitizer; the
// sandbox and the policy are what keep it harmless.
//
// The one script allowed in the frame is ours, which reports how tall the email is so the page can
// stack several emails without each scrolling inside its own box. The policy only runs a script
// carrying this document's random nonce, which the email cannot know, so scripts written into the
// email (tags and on* attributes alike) stay blocked. The sandbox must never gain allow-same-origin:
// together with allow-popups-to-escape-sandbox, a javascript: link in an email could then run
// in our origin.

import { collapseQuotedHtml } from "./emailQuotes";

/** The `type` of the message the frame posts to its parent with the email's height in pixels. */
export const EMAIL_FRAME_HEIGHT_MESSAGE = "br-email-height";

const csp = (nonce: string) =>
  `default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'`;

/** The iframe's `sandbox`: our height script runs and links may open in a new tab; nothing else. */
export const EMAIL_FRAME_SANDBOX = "allow-scripts allow-popups allow-popups-to-escape-sandbox";

/** Posts the height of the email, now and whenever it changes (a folded quote is opened, say). */
const HEIGHT_SCRIPT =
  "(function(){var root=document.documentElement;" +
  `function send(){parent.postMessage({type:"${EMAIL_FRAME_HEIGHT_MESSAGE}",height:root.offsetHeight},"*")}` +
  "new ResizeObserver(send).observe(root);send()})()";

/** `<meta http-equiv="refresh">` would navigate the frame to a remote page, so it is dropped. */
function stripMetaRefresh(html: string): string {
  return html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
}

// The "•••" button that folds an email's quoted earlier messages (see emailQuotes.ts).
const QUOTE_BUTTON_STYLE =
  "details.br-quote>summary{list-style:none;display:inline-block;cursor:pointer;margin:6px 0;padding:1px 8px;border-radius:10px;background:#e8eaed;color:#5f6368;font-size:11px;line-height:12px;letter-spacing:1px;user-select:none}" +
  "details.br-quote>summary::-webkit-details-marker{display:none}" +
  "details.br-quote[open]>summary{background:#f1f3f4}";

/**
 * The full document to give an iframe's `srcDoc` for an email's HTML body. Quoted earlier messages
 * are folded behind a button. Every call makes a new nonce, so build it once per email (useMemo):
 * a changing document reloads the frame.
 */
export function buildEmailFrameDocument(html: string, nonce = crypto.randomUUID()): string {
  return [
    "<!doctype html><html><head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${csp(nonce)}">`,
    '<base target="_blank">',
    // Before the email's markup, so nothing in it can swallow the script.
    `<script nonce="${nonce}">${HEIGHT_SCRIPT}</script>`,
    `<style>body{margin:12px;font-family:system-ui,sans-serif;font-size:14px;word-wrap:break-word}img{max-width:100%;height:auto}${QUOTE_BUTTON_STYLE}</style>`,
    "</head><body>",
    collapseQuotedHtml(stripMetaRefresh(html)),
    "</body></html>",
  ].join("");
}
