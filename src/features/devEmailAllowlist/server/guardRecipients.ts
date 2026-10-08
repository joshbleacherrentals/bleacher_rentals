import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALLOWED_EMAILS_PATH,
  applyAllowlistToToAndCc,
  emailAddressOf,
  isDevEmailRestricted,
  splitByAllowlist,
  splitRecipients,
} from "../logic/allowlist";

// Server-only (service-role client, so RLS does not apply). In the development environment — the
// one behind the green banner — an email only goes to an address on the DevAllowedEmails list
// (maintained at /dev-tools/allowed-emails). Everywhere else these functions are a no-op and never
// touch the database.
//
// Every dropped address is a console.error on purpose: when this is forgotten about, the missing
// email should point straight at the list.

const TAG = "[dev-email-guard]";

/** The allowlist as lower-cased addresses, or null when it cannot be read. */
async function loadAllowedEmails(supabaseAdmin: SupabaseClient<any>): Promise<Set<string> | null> {
  const { data, error } = await supabaseAdmin.from("DevAllowedEmails").select("email");
  if (error || !data) {
    console.error(
      `${TAG} Could not read DevAllowedEmails (${error?.message ?? "no data"}), so every email is blocked until it can be read.`,
    );
    return null;
  }
  return new Set(
    (data as { email: string | null }[])
      .filter((r) => r.email)
      .map((r) => emailAddressOf(r.email!)),
  );
}

function logBlocked(addresses: string[]) {
  for (const address of addresses) {
    console.error(
      `${TAG} Blocked email to ${emailAddressOf(address)}: it is not on the DevAllowedEmails list. ` +
        `If it should be sent in development, add it at ${ALLOWED_EMAILS_PATH}.`,
    );
  }
}

export type GuardedEmailRecipients = {
  to: string | null;
  cc: string | null;
  /** Addresses dropped because they are not on the list. */
  blocked: string[];
};

/**
 * For one email with a To and an optional Cc. A blocked address is dropped on its own; `to` is
 * null when nothing is left to send to. A list that cannot be read blocks everything — a broken
 * allowlist must never fall back to sending to anyone.
 */
export async function guardEmailRecipients(
  supabaseAdmin: SupabaseClient<any>,
  input: { to: string; cc?: string | null },
): Promise<GuardedEmailRecipients> {
  if (!isDevEmailRestricted()) {
    return { to: input.to, cc: input.cc ?? null, blocked: [] };
  }

  const allowed = (await loadAllowedEmails(supabaseAdmin)) ?? new Set<string>();
  const result = applyAllowlistToToAndCc(
    { to: splitRecipients(input.to), cc: splitRecipients(input.cc) },
    allowed,
  );
  logBlocked(result.blocked);

  return {
    to: result.to.length ? result.to.join(", ") : null,
    cc: result.cc.length ? result.cc.join(", ") : null,
    blocked: result.blocked,
  };
}

/** For a batch where each user gets their own email: keeps only the users on the list. */
export async function guardUserRecipients<T extends { email: string | null }>(
  supabaseAdmin: SupabaseClient<any>,
  users: T[],
): Promise<{ allowed: T[]; blocked: string[] }> {
  if (!isDevEmailRestricted()) return { allowed: users, blocked: [] };

  const allowedEmails = (await loadAllowedEmails(supabaseAdmin)) ?? new Set<string>();
  const { allowed: allowedAddresses, blocked } = splitByAllowlist(
    users.flatMap((u) => (u.email ? [u.email] : [])),
    allowedEmails,
  );
  logBlocked(blocked);

  const keep = new Set(allowedAddresses.map(emailAddressOf));
  return {
    allowed: users.filter((u) => u.email && keep.has(emailAddressOf(u.email))),
    blocked,
  };
}
