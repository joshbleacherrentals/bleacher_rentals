import "server-only";

import { directoryAdminFor, listDirectoryMailboxes, parseDirectoryAdmins } from "./directory";
import { getDomainMailboxes, getMailboxDomain, isValidDomain } from "./mailboxes";

export type MailboxSource = "directory" | "users";

export type ResolvedMailboxes = {
  domain: string;
  source: MailboxSource;
  mailboxes: string[];
  /** Directory only: who the lookup acted as, how many accounts Google returned, how many had no mailbox. */
  directory?: { admin: string; accounts: number; skippedNoMailbox: number };
};

/**
 * `?domain=` and `?source=` for the dev endpoints. `domain` is optional (the configured domain is
 * used); `source` is "directory" (ask Google, the default) or "users" (the app's Users table).
 */
export function parseMailboxSourceParams(
  params: URLSearchParams,
): { ok: true; domain?: string; source: MailboxSource } | { ok: false; error: string } {
  const domain = params.get("domain")?.trim().toLowerCase() || undefined;
  if (domain !== undefined && !isValidDomain(domain)) {
    return { ok: false, error: "?domain= must be a domain like bleacherrentals.com" };
  }

  const source = params.get("source")?.trim().toLowerCase() || "directory";
  if (source !== "directory" && source !== "users") {
    return { ok: false, error: "?source= must be directory or users" };
  }

  return { ok: true, domain, source };
}

/**
 * Every mailbox in a domain, from Google's Directory API (needs GMAIL_DIRECTORY_ADMINS to name an
 * admin of that domain) or, as a fallback, from the app's Users table.
 */
export async function resolveDomainMailboxes(params: {
  domain?: string;
  source: MailboxSource;
}): Promise<ResolvedMailboxes> {
  const domain = getMailboxDomain(params.domain);

  if (params.source === "users") {
    return { domain, source: "users", mailboxes: await getDomainMailboxes(domain) };
  }

  const admin = directoryAdminFor(domain, parseDirectoryAdmins(process.env.GMAIL_DIRECTORY_ADMINS));
  if (!admin) {
    throw new Error(
      `GMAIL_DIRECTORY_ADMINS has no admin of ${domain}. Set it to a comma-separated list with one ` +
        `admin address per domain, e.g. admin@${domain}.`,
    );
  }

  const { mailboxes, accounts, skippedNoMailbox } = await listDirectoryMailboxes({ domain, admin });
  return {
    domain,
    source: "directory",
    mailboxes,
    directory: { admin, accounts, skippedNoMailbox },
  };
}
