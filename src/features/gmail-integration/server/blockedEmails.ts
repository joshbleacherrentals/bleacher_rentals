import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// The guard that keeps one person's mail from being pulled up through the contacts page. Anyone can
// make a contact, so a contact for the owner's own address would show every email he ever sent or
// got. Two things are refused before Gmail is asked anything: any address at a company domain, and
// the addresses on BlockedCustomerEmails (maintained at /blocked-emails). A customer who writes to a
// blocked person is not affected: searching customer@xyz.com still finds that customer's emails
// with them.
//
// Reads with the service-role client, so row-level security does not apply.

const PAGE_SIZE = 1000; // PostgREST's default cap on rows per request

/**
 * Mail at these domains (and their subdomains) is never pulled, whether or not the address is on
 * the list. bleacherrentals.com is the company; tpi-3.ca is the Workspace used for testing.
 */
export const COMPANY_DOMAINS = ["bleacherrentals.com", "tpi-3.ca"];

export type BlockedCheck =
  | { status: "allowed" }
  | { status: "blocked"; reason: "listed" }
  | { status: "blocked"; reason: "company-domain"; domain: string }
  /** The list could not be read. Treat as blocked: a broken list must never let everything through. */
  | { status: "unreadable"; message: string };

const normalize = (email: string) => email.trim().toLowerCase();

/** The company domain an address is at, or null. `mail.tpi-3.ca` counts; `nottpi-3.ca` does not. */
export function companyDomainOf(address: string): string | null {
  const host = address.slice(address.lastIndexOf("@") + 1);
  return COMPANY_DOMAINS.find((domain) => host === domain || host.endsWith(`.${domain}`)) ?? null;
}

export async function checkBlockedCustomerEmail(
  supabase: SupabaseClient<any>,
  address: string,
): Promise<BlockedCheck> {
  const wanted = normalize(address);

  // Needs no list, so it holds even when the list cannot be read.
  const domain = companyDomainOf(wanted);
  if (domain) return { status: "blocked", reason: "company-domain", domain };

  // Every page is read, not one filtered query: the address is compared in code so no character in
  // it (_ and % are valid in an address) can act as a pattern, and a long list cannot cut one off.
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("BlockedCustomerEmails")
      .select("email")
      .order("id")
      .range(start, start + PAGE_SIZE - 1);

    if (error || !data) {
      const message = error?.message ?? "no data";
      console.error(
        `[blocked-emails] Could not read BlockedCustomerEmails (${message}), so no emails are pulled until it can be read.`,
      );
      return { status: "unreadable", message };
    }

    if (
      (data as { email: string | null }[]).some(
        (row) => row.email && normalize(row.email) === wanted,
      )
    ) {
      return { status: "blocked", reason: "listed" };
    }
    if (data.length < PAGE_SIZE) return { status: "allowed" };
  }
}
