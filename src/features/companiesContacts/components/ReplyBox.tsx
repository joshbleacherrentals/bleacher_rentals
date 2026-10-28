"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { useContactDirectory } from "../hooks/useContactDirectory";
import type { ThreadMessage } from "../hooks/useEmailThread";
import { personWithAddress, replyRecipients } from "../logic/emailActivity";
import { namesByAddress, recipientSummary } from "../logic/recipientList";
import { ReplyRecipients } from "./ReplyRecipients";

function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="flex gap-3">
      <span className="w-8 shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 break-words text-gray-800">{children}</span>
    </span>
  );
}

/**
 * Where a reply is written: a square box of a fixed size (the page sets it, see EmailView) that
 * takes the place of the footer's buttons, pinned to the bottom right of the page. Its header,
 * folded, is one line of who the reply goes to ("Mike Timmermans, no-contact@gmail.com": a contact
 * by name, anyone else by address). Clicking it opens "From" (the signed-in user, as "Josh
 * Redgrift (josh@bleacherrentals.com)") and To, Cc and Bcc lines, where who the reply goes to can
 * be changed (see ReplyRecipients). Clicking the header again does nothing: only clicking into the
 * text area folds it back. Nothing is sent yet. The text area takes focus when the box appears.
 */
export function ReplyBox({
  replyingTo,
}: {
  /** The email being answered: the newest of the thread. */
  replyingTo: ThreadMessage;
}) {
  const { data: currentUser, isLoading } = useCurrentUser();
  const user = currentUser?.[0];
  const ownAddress = user?.email ?? null;
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(" ");
  const from = ownAddress
    ? personWithAddress({ name: fullName || null, address: ownAddress })
    : isLoading
      ? "..."
      : "No email address on your account";

  // Who it goes to starts as whoever replyRecipients names, and follows it (the user's own address
  // is only known once they load) until the user changes the list, which then stays as they left it.
  const defaultRecipients = useMemo(
    () => replyRecipients(replyingTo, ownAddress).map((person) => person.address.toLowerCase()),
    [replyingTo, ownAddress],
  );
  const [edited, setEdited] = useState<string[] | null>(null);
  const recipients = edited ?? defaultRecipients;

  // One read of the contacts, for the folded line's names and the editor's suggestions.
  const directory = useContactDirectory();
  const summary = useMemo(
    () => recipientSummary(recipients, namesByAddress(directory)),
    [recipients, directory],
  );

  // Cc and Bcc start empty; each list is edited the same way as To.
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const recipientRows = [
    { label: "To", hint: "Add a recipient", recipients, onChange: setEdited },
    { label: "Cc", hint: "Add a Cc recipient", recipients: cc, onChange: setCc },
    { label: "Bcc", hint: "Add a Bcc recipient", recipients: bcc, onChange: setBcc },
  ];

  const [showAddresses, setShowAddresses] = useState(false);
  const [text, setText] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textarea.current?.focus();
  }, []);

  return (
    // A card floating over the page, so it brings its own background and shadow; the page places
    // and sizes it (see EmailView).
    <div className="flex h-full flex-col rounded border border-gray-300 bg-white shadow-lg focus-within:shadow-xl">
      {/*
        The box is as tall as the page makes it (h-full), whatever the header holds: the text area
        takes what is left and scrolls when the text is longer. A recipient's suggestions drop down
        over the text area, inside the box, so the box is never cut off by the bottom of the screen.
        ReplyRecipients caps their height (max-h-52) to fit in what is left under the open header.
      */}
      <div className="shrink-0 border-b border-gray-200">
        <button
          type="button"
          // The header only opens. Once open, clicking in the text area is what folds it.
          onClick={() => setShowAddresses(true)}
          aria-expanded={showAddresses}
          className={`block w-full rounded-t px-4 py-2 text-left text-sm transition-colors ${
            showAddresses ? "cursor-default" : "cursor-pointer hover:bg-gray-50"
          }`}
        >
          {showAddresses ? (
            <Line label="From">{from}</Line>
          ) : (
            <span className="block truncate text-gray-800">
              {summary || <span className="text-gray-400">No recipients</span>}
            </span>
          )}
        </button>
        {showAddresses &&
          recipientRows.map((row) => (
            <div key={row.label} className="flex gap-3 px-4 pb-2 text-sm">
              <span className="w-8 shrink-0 leading-[26px] text-gray-400">{row.label}</span>
              <ReplyRecipients
                label={row.hint}
                directory={directory}
                recipients={row.recipients}
                onChange={row.onChange}
              />
            </div>
          ))}
      </div>
      <textarea
        ref={textarea}
        value={text}
        onChange={(event) => setText(event.target.value)}
        // Going to type folds the header back to the one line.
        onFocus={() => setShowAddresses(false)}
        aria-label="Reply"
        placeholder="Write your reply..."
        className="block min-h-0 w-full flex-1 resize-none overflow-y-auto rounded-b p-4 text-sm text-gray-900 outline-none placeholder:text-gray-400"
      />
    </div>
  );
}
