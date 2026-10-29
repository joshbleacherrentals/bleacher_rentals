"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus } from "lucide-react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { saveContactEmails } from "../db/saveContactEmails";
import { sendReply } from "../db/sendReply";
import { useContactDirectory } from "../hooks/useContactDirectory";
import type { ThreadMessage } from "../hooks/useEmailThread";
import { personWithAddress, replyRecipients } from "../logic/emailActivity";
import { replyReferences, replySubject } from "../logic/emailReply";
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
 * text area folds it back. A minus at the top right of the header minimizes the box to a small
 * card (the page sizes it), and clicking that card restores it as it was: the draft, the
 * recipients and the header's state live here and survive being minimized. A footer with a Send
 * button stays at the bottom of the box however far the text has scrolled. Send posts the reply to
 * /api/gmail/send, saves the email it sends to the contact's thread, and calls `onSent`, which
 * closes the box; if the server refuses (who may send, and in development to whom, is its call) the
 * reason shows as an error toast and the draft stays. The text area takes focus when the box
 * appears and when it is restored.
 */
export function ReplyBox({
  contactUuid,
  replyingTo,
  minimized,
  onMinimize,
  onRestore,
  onSent,
}: {
  /** The contact whose thread this is: the sent email is saved to it. */
  contactUuid: string;
  /** The email being answered: the newest of the thread. */
  replyingTo: ThreadMessage;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  /** Called once the reply is sent. */
  onSent: () => void;
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

  const [sending, setSending] = useState(false);
  const canSend = !sending && text.trim() !== "" && recipients.length + cc.length + bcc.length > 0;

  const send = async () => {
    setSending(true);
    try {
      const sent = await sendReply({
        to: recipients,
        cc,
        bcc,
        subject: replySubject(replyingTo.subjectHeader),
        text,
        inReplyTo: replyingTo.messageIdHeader || null,
        references: replyReferences({
          messageId: replyingTo.messageIdHeader || null,
          references: replyingTo.referencesHeader || null,
        }),
        thread:
          replyingTo.mailbox && replyingTo.gmailThreadId
            ? { mailbox: replyingTo.mailbox, threadId: replyingTo.gmailThreadId }
            : null,
      });

      // It is sent now. Failing to save it must not look like failing to send: a second try would
      // send it twice. A later pull from Gmail brings it into the thread.
      if (sent) {
        try {
          await saveContactEmails(contactUuid, [sent]);
        } catch (error) {
          console.error("Reply sent, but it could not be saved to the thread:", error);
        }
      }
      onSent();
    } catch (error: any) {
      createErrorToastNoThrow([error?.message ?? "Could not send the reply."]);
      setSending(false);
    }
  };

  // On appearing, and again on being restored from minimized.
  useEffect(() => {
    if (!minimized) textarea.current?.focus();
  }, [minimized]);

  if (minimized) {
    return (
      <button
        type="button"
        onClick={onRestore}
        aria-label="Restore the reply"
        title="Restore"
        className="flex w-full cursor-pointer items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-lg transition-colors hover:bg-gray-50"
      >
        <span className="min-w-0 flex-1 truncate text-gray-800">
          {summary ? `Reply to ${summary}` : "Reply"}
        </span>
        <Maximize2 className="size-3.5 shrink-0 text-gray-500" />
      </button>
    );
  }

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
      <div className="relative shrink-0 border-b border-gray-200">
        <button
          type="button"
          // The header only opens. Once open, clicking in the text area is what folds it.
          onClick={() => setShowAddresses(true)}
          aria-expanded={showAddresses}
          // px-4 is the same side padding as the To, Cc and Bcc rows below, so the lines start
          // together. The pr-8 inside keeps the text clear of the minimize button at the top right.
          className={`block w-full rounded-t px-4 py-2 text-left text-sm transition-colors ${
            showAddresses ? "cursor-default" : "cursor-pointer hover:bg-gray-50"
          }`}
        >
          {showAddresses ? (
            <span className="block pr-8">
              <Line label="From">{from}</Line>
            </span>
          ) : (
            <span className="block truncate pr-8 text-gray-800">
              {summary || <span className="text-gray-400">No recipients</span>}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize the reply"
          title="Minimize"
          className="absolute right-2 top-1.5 inline-flex size-6 cursor-pointer items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <Minus className="size-4" />
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
        className="block min-h-0 w-full flex-1 resize-none overflow-y-auto p-4 text-sm text-gray-900 outline-none placeholder:text-gray-400"
      />
      {/* The text area scrolls on its own, so this stays at the bottom of the box in view. */}
      <div className="flex shrink-0 items-center gap-3 border-t border-gray-200 px-4 py-3">
        {/* bg-darkBlue is the brand's dark blue (see globals.css); px-8 is 32px each side. */}
        <Button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className="rounded-full bg-darkBlue px-8 hover:bg-darkBlue/90"
        >
          {sending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}
