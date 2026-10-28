"use client";

import { Loader2 } from "lucide-react";
import { useContactEmailMessages } from "../hooks/useContactEmailMessages";
import { usePullContactEmails } from "../hooks/usePullContactEmails";
import type { ActivityEmail } from "../logic/emailActivity";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function EmailRow({ email, onOpen }: { email: ActivityEmail; onOpen: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        title="Open this email"
        className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer gap-3 rounded px-2 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-sm font-semibold text-gray-900">{email.subject}</p>
            <span className="shrink-0 text-xs text-gray-400">{formatDate(email.date)}</span>
          </div>
          <p className="truncate text-xs text-gray-500">
            {email.from}
            {email.to && <span className="text-gray-300"> → </span>}
            {email.to}
          </p>
          {email.snippet && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-600">{email.snippet}</p>
          )}
        </div>
      </button>
    </li>
  );
}

/**
 * A contact's emails, read from the local database. When there are none, offers to pull them from
 * Gmail (every company mailbox is searched for their address); the pull saves them to the database
 * and the list fills in by itself.
 */
export function ContactEmailsTab({
  contactUuid,
  contactEmail,
  onOpenEmail,
}: {
  contactUuid: string;
  contactEmail: string | null;
  /** Called with the clicked email's EmailMessages.id (an ActivityEmail's key). */
  onOpenEmail: (emailMessageUuid: string) => void;
}) {
  const { emails, isLoading } = useContactEmailMessages(contactUuid);
  const { state, pull } = usePullContactEmails();

  const busy = state.status === "searching" || state.status === "saving";
  const pullFromGmail = () => {
    if (contactEmail) void pull({ contactUuid, address: contactEmail });
  };

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-gray-400">Loading...</p>;
  }

  if (emails.length > 0) {
    return (
      <div>
        <ul className="divide-y divide-gray-100">
          {emails.map((email) => (
            <EmailRow key={email.key} email={email} onOpen={() => onOpenEmail(email.key)} />
          ))}
        </ul>

        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-gray-400">
          <span>
            {state.status === "done" && state.mailboxesFailed > 0
              ? `${state.mailboxesFailed} of ${state.mailboxesSearched} mailboxes could not be searched.`
              : state.status === "done"
                ? state.added > 0
                  ? `${state.added} new from Gmail.`
                  : "No new emails."
                : state.status === "error"
                  ? state.message
                  : ""}
          </span>
          {contactEmail && (
            <button
              type="button"
              onClick={pullFromGmail}
              disabled={busy}
              className="shrink-0 cursor-pointer font-medium text-darkBlue transition-colors hover:text-lightBlue disabled:cursor-default disabled:opacity-50"
            >
              {busy ? "Pulling..." : "Pull again from Gmail"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (busy) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
        <Loader2 className="size-4 animate-spin" />
        {state.status === "saving"
          ? `Saving ${state.found} emails...`
          : "Searching every mailbox..."}
      </p>
    );
  }

  if (!contactEmail) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        Add an email address to this contact to pull their emails from Gmail.
      </p>
    );
  }

  return (
    <div className="py-6 text-center">
      {state.status === "done" && state.found === 0 && (
        <p className="mb-3 text-sm text-gray-500">
          No emails with {contactEmail} were found in {state.mailboxesSearched} mailboxes.
        </p>
      )}
      {state.status === "done" && state.found > 0 && (
        <p className="mx-auto mb-3 max-w-md text-sm text-gray-500">
          Found {state.found} emails but none are showing yet. If this stays, the server did not
          accept them.
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="mx-auto mb-3 max-w-md text-sm text-red-600">
          {state.message}
        </p>
      )}
      <button
        type="button"
        onClick={pullFromGmail}
        className="cursor-pointer rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
      >
        {state.status === "idle" ? "No emails. Pull from Gmail?" : "Pull from Gmail again?"}
      </button>
    </div>
  );
}
