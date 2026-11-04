import "server-only";

import { getDelegatedAccessToken } from "./delegatedAuth";
import { pickDomainMailboxes } from "./mailboxes";

// Asks Google itself which mailboxes exist in a Workspace domain (the Directory API), so the list is
// complete and current and nothing is stored. It needs two things beyond Gmail access: the Admin SDK
// API switched on in the Cloud project, and the scope below authorized for the service account in
// that domain's Admin console. The Directory API is admin territory, so the call is made as an
// admin of the domain (listed in GMAIL_DIRECTORY_ADMINS).

export const DIRECTORY_USER_READONLY_SCOPE =
  "https://www.googleapis.com/auth/admin.directory.user.readonly";

const DIRECTORY_USERS_URL = "https://admin.googleapis.com/admin/directory/v1/users";
const PAGE_SIZE = 500;
const MAX_PAGES = 20; // 10,000 accounts: a runaway loop guard, far above any real company

type DirectoryUser = {
  primaryEmail?: string;
  suspended?: boolean;
  archived?: boolean;
  /** False when the account has no Gmail mailbox (no Gmail license). */
  isMailboxSetup?: boolean;
};

/** Comma-separated admin addresses, one per domain: trimmed, lowercased, de-duplicated. */
export function parseDirectoryAdmins(raw: string | undefined): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((admin) => admin.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

/** The admin to act as for `domain`: the listed admin whose address is on that domain. */
export function directoryAdminFor(domain: string, admins: string[]): string | null {
  return admins.find((admin) => admin.endsWith(`@${domain.toLowerCase()}`)) ?? null;
}

/**
 * The accounts that have a mailbox to search. Suspended and archived accounts are kept: they may
 * still hold the history, and one Gmail refuses just reports its own error. Only an account known
 * to have no mailbox at all is left out.
 */
export function pickDirectoryMailboxes(
  users: DirectoryUser[],
  domain: string,
): { mailboxes: string[]; skippedNoMailbox: number } {
  const withMailbox = users.filter((u) => u.isMailboxSetup !== false);
  return {
    mailboxes: pickDomainMailboxes(
      withMailbox.map((u) => u.primaryEmail ?? null),
      domain,
    ),
    skippedNoMailbox: users.length - withMailbox.length,
  };
}

/** Every mailbox in `domain`, listed by Google. `admin` is who the service account acts as. */
export async function listDirectoryMailboxes(params: {
  domain: string;
  admin: string;
}): Promise<{ mailboxes: string[]; accounts: number; skippedNoMailbox: number }> {
  const accessToken = await getDelegatedAccessToken({
    subject: params.admin,
    scopes: [DIRECTORY_USER_READONLY_SCOPE],
  });

  const users: DirectoryUser[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({
      domain: params.domain,
      maxResults: String(PAGE_SIZE),
      fields: "nextPageToken,users(primaryEmail,suspended,archived,isMailboxSetup)",
    });
    if (pageToken) query.set("pageToken", pageToken);

    const res = await fetch(`${DIRECTORY_USERS_URL}?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(
        `Directory API ${res.status}: ${body?.error?.message ?? res.statusText}. ` +
          `It needs the Admin SDK API enabled in the Cloud project, the ${DIRECTORY_USER_READONLY_SCOPE} ` +
          `scope authorized in the ${params.domain} Admin console, and ${params.admin} to be an admin.`,
      );
    }

    const body: { users?: DirectoryUser[]; nextPageToken?: string } = await res.json();
    users.push(...(body.users ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  return { ...pickDirectoryMailboxes(users, params.domain), accounts: users.length };
}
