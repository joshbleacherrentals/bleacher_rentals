"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Maximize2, Minus } from "lucide-react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { createPendingEmail } from "../db/createPendingEmail";
import { sendPendingEmail } from "../db/sendPendingEmail";
import { useContactDirectory } from "../hooks/useContactDirectory";
import type { ThreadMessage } from "../hooks/useEmailThread";
import { useForwardedText } from "../hooks/useForwardedText";
import { personWithAddress, replyAllRecipients, replyRecipients } from "../logic/emailActivity";
import { forwardedMessageText } from "../logic/emailForward";
import { forwardSubject, replyReferences, replySubject, type ReplyMode } from "../logic/emailReply";
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
 * takes the place of the footer's buttons, pinned to the bottom right of the page. It opens as a
 * Reply (to the sender), a Reply all (to everyone on the email, with whoever it copied in Cc) or a
 * Forward (to nobody yet, with the email's text in the box below room for a note; it keeps the
 * email's thread headers so it stays in this thread here).
 * Its header, folded, is one line of who the reply goes to, To and Cc ("Mike Timmermans,
 * no-contact@gmail.com": a contact by name, anyone else by address). Clicking it opens "From" (the signed-in user, as "Josh
 * Redgrift (josh@bleacherrentals.com)") and To, Cc and Bcc lines, where who the reply goes to can
 * be changed (see ReplyRecipients). Clicking the header again does nothing: only clicking into the
 * text area folds it back. A minus at the top right of the header minimizes the box to a small
 * card (the page sizes it), and clicking that card restores it as it was: the draft, the
 * recipients and the header's state live here and survive being minimized. A footer with a Send
 * button stays at the bottom of the box however far the text has scrolled. Send saves the reply at
 * once as an email being sent, in the contact's thread (body included, so it is complete to open),
 * and calls `onSent`, which closes the box. The send itself then happens in the background through
 * /api/gmail/send, which updates that email when it is sent. If it cannot be sent (who may send,
 * and in development to whom, is the server's call) the email is marked failed with the reason, and
 * the reason shows as an error toast too. If the reply could not even be saved, the box stays open
 * with the draft. The text area takes focus when the box appears and when it is restored.
 */
export function ReplyBox({
  contactUuid,
  replyingTo,
  mode,
  minimized,
  onMinimize,
  onRestore,
  onSent,
}: {
  /** The contact whose thread this is: the reply is saved to it. */
  contactUuid: string;
  /** The email being answered: the newest of the thread that has been sent or received. */
  replyingTo: ThreadMessage;
  /**
   * Reply starts with the sender in To; Reply all with everyone on the email, To and Cc; Forward
   * with nobody, and the email's text in the box.
   */
  mode: ReplyMode;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  /** Called once the reply is saved and on its way, so the box can close. */
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

  // Who it goes to starts as whoever replyRecipients names (Reply), or replyAllRecipients names, To
  // and Cc (Reply all), or nobody (Forward: the user picks), and follows it (the user's own address
  // is only known once they load) until the user changes a list, which then stays as they left it.
  const defaults = useMemo(() => {
    const lower = (people: { address: string }[]) =>
      people.map((person) => person.address.toLowerCase());
    if (mode === "forward") return { to: [], cc: [] };
    if (mode === "replyAll") {
      const everyone = replyAllRecipients(replyingTo, ownAddress);
      return { to: lower(everyone.to), cc: lower(everyone.cc) };
    }
    return { to: lower(replyRecipients(replyingTo, ownAddress)), cc: [] };
  }, [mode, replyingTo, ownAddress]);
  const [editedTo, setEditedTo] = useState<string[] | null>(null);
  const [editedCc, setEditedCc] = useState<string[] | null>(null);
  const recipients = editedTo ?? defaults.to;
  const cc = editedCc ?? defaults.cc;

  // One read of the contacts, for the folded line's names and the editor's suggestions. The folded
  // line names everyone it will be seen by, so Cc is on it too; Bcc is not, being hidden by nature.
  const directory = useContactDirectory();
  const summary = useMemo(
    () => recipientSummary([...recipients, ...cc], namesByAddress(directory)),
    [recipients, cc, directory],
  );

  // Bcc starts empty; each list is edited the same way.
  const [bcc, setBcc] = useState<string[]>([]);
  const recipientRows = [
    { label: "To", hint: "Add a recipient", recipients, onChange: setEditedTo },
    { label: "Cc", hint: "Add a Cc recipient", recipients: cc, onChange: setEditedCc },
    { label: "Bcc", hint: "Add a Bcc recipient", recipients: bcc, onChange: setBcc },
  ];

  // A forward opens with the header unfolded, since the first thing to do is to pick who to send
  // it to.
  const [showAddresses, setShowAddresses] = useState(mode === "forward");
  const [text, setText] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);

  // A forward carries the email it forwards: its "Forwarded message" block and text go into the box
  // once the body is there (it is loaded if it was not yet saved), below room for a note. Added to
  // what has been typed meanwhile, once, and the cursor goes back to the top for the note.
  const forwarded = useForwardedText(replyingTo.key, mode === "forward");
  const prefilled = useRef(false);
  useEffect(() => {
    if (mode !== "forward" || forwarded.text === null || prefilled.current) return;
    prefilled.current = true;
    const block = forwardedMessageText({
      from: replyingTo.fromHeader,
      date: replyingTo.date,
      subject: replyingTo.subjectHeader,
      to: replyingTo.toHeader,
      cc: replyingTo.ccHeader,
      body: forwarded.text,
    });
    const wasEmpty = text === "";
    setText(text + block);
    if (wasEmpty) {
      requestAnimationFrame(() => {
        textarea.current?.setSelectionRange(0, 0);
        if (textarea.current) textarea.current.scrollTop = 0;
      });
    }
  }, [mode, forwarded.text, replyingTo, text]);
  useEffect(() => {
    if (forwarded.error) {
      createErrorToastNoThrow(["Could not load the email to forward", forwarded.error]);
    }
  }, [forwarded.error]);

  const [sending, setSending] = useState(false);
  const canSend =
    !sending &&
    ownAddress !== null &&
    text.trim() !== "" &&
    recipients.length + cc.length + bcc.length > 0;

  // The reply is saved on this device first, as an email being sent, so it is in the thread the
  // moment Send is pressed and the box can close at once; the server sends it in the background and
  // updates that email, or marks it failed with the reason (see sendPendingEmail).
  const send = async () => {
    if (ownAddress === null) return;
    setSending(true);

    const subject =
      mode === "forward"
        ? forwardSubject(replyingTo.subjectHeader)
        : replySubject(replyingTo.subjectHeader);
    const inReplyTo = replyingTo.messageIdHeader || null;
    const references = replyReferences({
      messageId: replyingTo.messageIdHeader || null,
      references: replyingTo.referencesHeader || null,
    });

    try {
      const emailMessageUuid = await createPendingEmail({
        contactUuid,
        sender: { address: ownAddress, name: fullName || null },
        to: recipients,
        cc,
        subject,
        text,
        inReplyTo,
        references,
      });
      onSent();

      // Not awaited: the box is gone by now. The email itself shows how it went; the toast makes
      // sure the reason is seen too.
      void sendPendingEmail({
        emailMessageUuid,
        to: recipients,
        cc,
        bcc,
        subject,
        text,
        inReplyTo,
        references,
        thread:
          replyingTo.mailbox && replyingTo.gmailThreadId
            ? { mailbox: replyingTo.mailbox, threadId: replyingTo.gmailThreadId }
            : null,
      }).then((result) => {
        if (!result.ok) createErrorToastNoThrow([result.message]);
      });
    } catch (error: any) {
      // Nothing was saved or sent, so the draft stays for another try.
      createErrorToastNoThrow([error?.message ?? "Could not send the reply."]);
      setSending(false);
    }
  };

  // On appearing, and again on being restored from minimized. A forward with nobody to send it to
  // yet puts the cursor in To instead (see autoFocus below).
  const needsRecipient = mode === "forward" && recipients.length === 0;
  useEffect(() => {
    if (!minimized && !needsRecipient) textarea.current?.focus();
    // Only when appearing or restored, not each time the first recipient is picked.
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
          {mode === "forward"
            ? summary
              ? `Forward to ${summary}`
              : "Forward"
            : summary
              ? `Reply to ${summary}`
              : "Reply"}
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
                autoFocus={needsRecipient && row.label === "To"}
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
