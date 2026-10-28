import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

// The guard that keeps one person's mail from being pulled up through the contacts page. Anyone can
// make a contact, so a contact for the owner's own address would show every email he ever sent or
// got. The addresses on BlockedCustomerEmails (maintained at /blocked-emails) are refused before
// Gmail is asked anything. A customer who writes to a blocked person is not affected: searching
// customer@xyz.com still finds that customer's emails with them.
//
// Reads with the service-role client, so row-level security does not apply.

const PAGE_SIZE = 1000; // PostgREST's default cap on rows per request

export type BlockedCheck =
  | { status: "allowed" }
  | { status: "blocked" }
  /** The list could not be read. Treat as blocked: a broken list must never let everything through. */
  | { status: "unreadable"; message: string };

const normalize = (email: string) => email.trim().toLowerCase();

export async function checkBlockedCustomerEmail(
  supabase: SupabaseClient<any>,
  address: string,
): Promise<BlockedCheck> {
  const wanted = normalize(address);

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
      return { status: "blocked" };
    }
    if (data.length < PAGE_SIZE) return { status: "allowed" };
  }
}
