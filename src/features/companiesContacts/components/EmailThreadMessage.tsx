"use client";

import { UserAvatar } from "@/features/manageTeam/components/util/UserAvatar";
import type { ThreadMessage } from "../hooks/useEmailThread";
import { personNameParts } from "../logic/emailActivity";
import { EmailMessageBody } from "./EmailMessageBody";
import { EmailRecipients } from "./EmailRecipients";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One email of a thread: a header with the sender's avatar, who it is from and when, and under the
 * name a line of its snippet. Clicking the header opens the whole email, and clicking again closes
 * it. Each email opens and closes on its own. An open email swaps the snippet for "To ..." (who it
 * went to, with the full addresses a click away), since the email itself is right below. The avatar
 * is the team lists' one, given the sender's initials: only a team member signed in as themselves
 * gets a photo, and an email's sender has none.
 */
export function EmailThreadMessage({
  message,
  open,
  onToggle,
}: {
  message: ThreadMessage;
  open: boolean;
  onToggle: () => void;
}) {
  const { firstName, lastName } = personNameParts(message.from);
  const dateText = formatDate(message.date);

  return (
    <section className="border-b border-gray-200">
      <div className="relative flex items-start gap-3 px-6 py-3 transition-colors hover:bg-gray-50">
        {/* The whole header is the button, laid over it; the "To" control sits above this. */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${message.from}, ${dateText}`}
          className="absolute inset-0 cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 focus-visible:outline-none"
        />
        <UserAvatar firstName={firstName} lastName={lastName} className="h-9 w-9" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={`truncate text-sm text-gray-900 ${open ? "font-semibold" : "font-medium"}`}
            >
              {message.from}
            </span>
            <span className="shrink-0 text-xs text-gray-400">{dateText}</span>
          </div>
          {open ? (
            <EmailRecipients message={message} dateText={dateText} />
          ) : (
            <span className="block truncate text-sm text-gray-500">{message.snippet}</span>
          )}
        </div>
      </div>

      {open && <EmailMessageBody emailMessageUuid={message.key} />}
    </section>
  );
}
