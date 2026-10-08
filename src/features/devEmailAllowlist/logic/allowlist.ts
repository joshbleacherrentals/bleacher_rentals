// Pure rules for the development email allowlist. No I/O — the database read lives in
// server/guardRecipients.ts, so these can be tested without a client.

export const ALLOWED_EMAILS_PATH = "/dev-tools/allowed-emails";

/**
 * True in the environment that shows the green "Development - Changes won't affect production
 * data" banner (components/Header.tsx). Exact match on purpose: a misspelt or missing value must
 * never turn the restriction on in production, and staging keeps sending as before.
 */
export function isDevEmailRestricted(
  environment: string | undefined = process.env.NEXT_PUBLIC_ENVIRONMENT,
): boolean {
  return environment === "development";
}

/** "Sam Rivera <Sam@X.com>" -> "sam@x.com". Bare addresses are trimmed and lower-cased. */
export function emailAddressOf(recipient: string): string {
  const match = recipient.match(/<([^>]+)>/);
  return (match ? match[1] : recipient).trim().toLowerCase();
}

/** A comma separated To/Cc value as a list, blanks dropped. */
export function splitRecipients(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function splitByAllowlist(
  recipients: string[],
  allowed: ReadonlySet<string>,
): { allowed: string[]; blocked: string[] } {
  const kept: string[] = [];
  const blocked: string[] = [];
  for (const recipient of recipients) {
    (allowed.has(emailAddressOf(recipient)) ? kept : blocked).push(recipient);
  }
  return { allowed: kept, blocked };
}

/**
 * Filters a To/Cc pair. A blocked address is dropped on its own, so the rest of the email still
 * goes out. When the To is blocked but a Cc is allowed, the Cc becomes the To — an email with
 * no To is not something to rely on Postmark accepting.
 */
export function applyAllowlistToToAndCc(
  input: { to: string[]; cc: string[] },
  allowed: ReadonlySet<string>,
): { to: string[]; cc: string[]; blocked: string[] } {
  const to = splitByAllowlist(input.to, allowed);
  const cc = splitByAllowlist(input.cc, allowed);
  const blocked = [...to.blocked, ...cc.blocked];

  if (to.allowed.length === 0 && cc.allowed.length > 0) {
    return { to: cc.allowed, cc: [], blocked };
  }
  return { to: to.allowed, cc: cc.allowed, blocked };
}
