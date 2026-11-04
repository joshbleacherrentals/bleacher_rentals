import "server-only";

import { createServiceRoleClient } from "@/utils/supabase/server";

const DEFAULT_DOMAIN = "bleacherrentals.com";

export function isValidDomain(domain: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(domain);
}

/**
 * The company email domain whose mailboxes are searched: `override` if given (a dev asking for a
 * test Workspace such as tpi-3.ca), else `GMAIL_MAILBOX_DOMAIN`, else bleacherrentals.com.
 */
export function getMailboxDomain(override?: string): string {
  const domain = (override || process.env.GMAIL_MAILBOX_DOMAIN || DEFAULT_DOMAIN)
    .trim()
    .toLowerCase();
  if (!isValidDomain(domain)) throw new Error(`Not a domain: ${domain}`);
  return domain;
}

/** The addresses that are on exactly `domain` (not a subdomain or lookalike), lowercased, once each. */
export function pickDomainMailboxes(emails: (string | null)[], domain: string): string[] {
  const suffix = `@${domain.toLowerCase()}`;
  const mailboxes = emails
    .map((email) => (email ?? "").trim().toLowerCase())
    .filter((email) => email.endsWith(suffix) && email.length > suffix.length);
  return [...new Set(mailboxes)].sort();
}

/**
 * The app's users whose email is on the company domain. Everyone who uses the app has one, and a
 * former employee's mailbox is included on purpose, because their history is still in it. A mailbox
 * Workspace no longer serves just comes back with an error of its own. Misses anyone without an
 * app account; the Directory lookup (directory.ts) is the complete list.
 */
export async function getDomainMailboxes(domain: string = getMailboxDomain()): Promise<string[]> {
  const supabase = await createServiceRoleClient();

  const { data, error } = await supabase
    .from("Users")
    .select("email")
    .ilike("email", `%@${domain}`);
  if (error) throw new Error(`Could not list the ${domain} mailboxes: ${error.message}`);

  return pickDomainMailboxes(
    (data ?? []).map((row) => row.email),
    domain,
  );
}
