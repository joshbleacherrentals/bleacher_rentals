// An email's HTML is written by a stranger, so it is never put in the page itself. It goes into a
// sandboxed iframe (no scripts, no access to our page or cookies) whose document also carries a
// Content-Security-Policy that blocks everything remote: no tracking pixels, no external images,
// styles or fonts. Inline styles and data: images still work. This is not a sanitizer; the sandbox
// and the policy are what keep it harmless.

const CSP = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'";

/** The iframe's `sandbox`: links may open in a new tab; nothing else is allowed. */
export const EMAIL_FRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/** `<meta http-equiv="refresh">` would navigate the frame to a remote page, so it is dropped. */
function stripMetaRefresh(html: string): string {
  return html.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "");
}

/** The full document to give an iframe's `srcDoc` for an email's HTML body. */
export function buildEmailFrameDocument(html: string): string {
  return [
    "<!doctype html><html><head>",
    '<meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
    '<base target="_blank">',
    "<style>body{margin:12px;font-family:system-ui,sans-serif;font-size:14px;word-wrap:break-word}img{max-width:100%;height:auto}</style>",
    "</head><body>",
    stripMetaRefresh(html),
    "</body></html>",
  ].join("");
}
