"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Lottie from "lottie-react";
import { useAuth } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useContacts } from "@/features/companiesContacts/hooks/useContacts";
import type { ContactSuggestion } from "@/components/EmailChipInput";
import {
  buildSendQuoteInput,
  checkSendLimits,
  fetchSendPreview,
  formatRecipientsLine,
  type RecipientFields,
  type SendPreview,
  type SendQuoteInput,
} from "../../utils/sendQuote";
import { fileRefusal, uploadEventFile } from "../../utils/eventFileUpload";
import {
  canDismiss,
  canSend,
  ignoreDialogEscape,
  runSend,
  type AddedFile,
  type PendingFile,
  type SendPhase,
} from "./sendQuoteFlow";
import { attachmentRows, attachmentSizes, openingRecipients } from "./sendDialogModel";
import { SendQuoteReviewForm } from "./SendQuoteReviewForm";
import successAnimation from "../../../../../public/animations/Success.json";

export type SendQuoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Must already be saved: the PDF and email preview are built from the stored quote. */
  eventId: string;
  recipientEmails: string[];
  /** Create flow: runs just before the email, e.g. to mark the quote Quoted. */
  onBeforeSend?: () => Promise<void>;
  /** Runs after the email is confirmed sent, with the final To, Cc and Bcc — logs it and does any
   *  page cleanup. */
  onSent: (sent: SendQuoteInput, addedFiles: AddedFile[]) => Promise<void> | void;
  /** Runs when the person closes the dialog after a confirmed send. */
  onDone?: () => void;
};

export function SendQuoteDialog({
  open,
  onOpenChange,
  eventId,
  recipientEmails,
  onBeforeSend,
  onSent,
  onDone,
}: SendQuoteDialogProps) {
  const [phase, setPhase] = useState<SendPhase>("review");
  const [preview, setPreview] = useState<SendPreview | null>(null);
  const [error, setError] = useState("");
  const [mobileView, setMobileView] = useState(false);
  // The recipients of this opening. Taken from the live `recipientEmails` when the dialog opens and
  // then frozen (see openingRecipients), so a contact sync cannot reset a send in flight.
  const [recipients, setRecipients] = useState<string[]>(recipientEmails);
  const [fields, setFields] = useState<RecipientFields>({
    to: recipientEmails,
    cc: [],
    bcc: [],
  });
  const [subject, setSubject] = useState("");
  const [removedKeys, setRemovedKeys] = useState<ReadonlySet<string>>(new Set());
  const [added, setAdded] = useState<PendingFile[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sentInput, setSentInput] = useState<SendQuoteInput | null>(null);
  // pending-file id -> EventFiles id. Kept across attempts so "Try again" never uploads twice.
  const uploadedIds = useRef(new Map<string, string>());
  const subjectInitialised = useRef(false);
  const recipientKey = recipients.join(",");

  const supabase = useClerkSupabaseClient();
  const { userId } = useAuth();
  const { contacts } = useContacts();
  const suggestions = useMemo<ContactSuggestion[]>(
    () =>
      contacts
        .filter((c) => !!c.email)
        .map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" "),
          email: c.email as string,
        })),
    [contacts],
  );

  // Reset for a new opening while rendering, not in an effect: an effect would let the first frame
  // of a reopen show the previous "sent" state.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPhase("review");
      setError("");
      setPreview(null);
      setMobileView(false);
      setRecipients(recipientEmails);
      setFields({ to: recipientEmails, cc: [], bcc: [] });
      setSubject("");
      setRemovedKeys(new Set());
      setAdded([]);
      setFileError(null);
      setSentInput(null);
    }
  }
  // An opening that started with no contacts yet picks them up once, before anything is done.
  const adopted = open ? openingRecipients(recipients, recipientEmails, phase) : recipients;
  if (adopted !== recipients) {
    setRecipients(adopted);
    setFields((f) => (f.to.length ? f : { ...f, to: adopted }));
  }

  useEffect(() => {
    if (!open) return;
    subjectInitialised.current = false;
    uploadedIds.current = new Map();
  }, [open, eventId]);

  useEffect(() => {
    if (!open || recipients.length === 0) return;
    let cancelled = false;
    void fetchSendPreview(eventId, recipients).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId, recipientKey]);

  // The subject starts as the template's. Set once per opening, so clearing it stays cleared (D8).
  useEffect(() => {
    if (preview?.ok && !subjectInitialised.current) {
      subjectInitialised.current = true;
      setSubject(preview.subject);
    }
  }, [preview]);

  const rows = useMemo(
    () => (preview?.ok ? attachmentRows(preview.attachments, removedKeys, added) : []),
    [preview, removedKeys, added],
  );
  const limits = checkSendLimits({ ...fields, attachmentSizes: attachmentSizes(rows) });

  const addFiles = (files: File[]) => {
    const accepted: PendingFile[] = [];
    let refusal: string | null = null;
    for (const file of files) {
      const why = fileRefusal(file);
      if (why) refusal = `${file.name}: ${why.title}. ${why.detail}.`;
      else accepted.push({ id: crypto.randomUUID(), file });
    }
    setFileError(refusal);
    if (accepted.length) setAdded((prev) => [...prev, ...accepted]);
  };

  const removeAttachment = (key: string) => {
    if (added.some((p) => p.id === key)) setAdded((prev) => prev.filter((p) => p.id !== key));
    else setRemovedKeys((prev) => new Set(prev).add(key));
    setFileError(null);
  };

  const close = () => {
    if (!canDismiss(phase)) return;
    // onDone first: the parent may still need what it clears when it handles onOpenChange.
    if (phase === "sent") onDone?.();
    onOpenChange(false);
  };

  const send = async () => {
    if (!preview?.ok) return;
    setPhase("sending");
    const result = await runSend({
      eventId,
      buildInput: (addedFileIds) =>
        buildSendQuoteInput({
          ...fields,
          subject,
          attachments: rows.filter((r) => !r.pending),
          previewAttachmentKeys: preview.attachments.map((a) => a.key),
          addedFileIds,
        }),
      pendingFiles: added,
      uploadedIds: uploadedIds.current,
      upload: (file) =>
        uploadEventFile({
          supabase,
          eventId,
          file,
          source: "email_attachment",
          uploadedBy: userId,
        }),
      onBeforeSend,
      onSent: (input, addedFiles) => {
        setSentInput(input);
        return onSent(input, addedFiles);
      },
    });
    if (result.ok) {
      setPhase("sent");
    } else if (result.stage === "upload") {
      // Nothing was sent: back to the form with everything as it was, so the person can remove the
      // failing file or press Send again. Files already uploaded are not uploaded twice.
      setFileError(result.message);
      setPhase("review");
    } else {
      setError(result.message);
      setPhase("error");
    }
  };

  const sendable = canSend({
    recipients: fields.to,
    preview,
    withinLimits: limits.ok,
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-4 rounded-none border-0 sm:max-w-none"
        onEscapeKeyDown={(e) =>
          ignoreDialogEscape(phase, document.activeElement) && e.preventDefault()
        }
      >
        {phase === "review" && (
          <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[25%_1fr]">
            {preview?.ok ? (
              <SendQuoteReviewForm
                from={preview.from}
                fields={fields}
                onFieldsChange={setFields}
                suggestions={suggestions}
                subject={subject}
                onSubjectChange={setSubject}
                attachments={rows}
                onRemoveAttachment={removeAttachment}
                onAddFiles={addFiles}
                fileError={fileError}
                limitMessage={limits.ok ? null : limits.message}
                mobileView={mobileView}
                onMobileViewChange={setMobileView}
                sendable={sendable}
                onSend={send}
                onCancel={close}
              />
            ) : (
              <div className="flex min-h-0 min-w-0 flex-col gap-4">
                <DialogHeader>
                  <DialogTitle>Review before sending</DialogTitle>
                  <DialogDescription>Nothing is sent until you press Send.</DialogDescription>
                </DialogHeader>
                <div className="mt-auto flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 cursor-pointer rounded-sm border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex-1 cursor-not-allowed rounded-sm bg-darkBlue px-4 py-2 text-sm font-semibold text-white opacity-50"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}

            <div className="flex min-h-[24rem] min-w-0 flex-col">
              {recipients.length === 0 ? (
                <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                  No contact email found. Add a contact with an email address before sending.
                </p>
              ) : !preview ? (
                <div className="flex items-center gap-2 py-10 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" /> Loading preview…
                </div>
              ) : !preview.ok ? (
                <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
                  This quote can&apos;t be sent yet: {preview.reason}
                </p>
              ) : (
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview.htmlBody}
                  style={{ width: mobileView ? 375 : "100%", maxWidth: "100%" }}
                  className="mx-auto block min-h-0 flex-1 rounded border border-gray-200 bg-white"
                />
              )}
            </div>
          </div>
        )}

        {phase === "sending" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <DialogTitle className="sr-only">Sending quote</DialogTitle>
            <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
            <p className="text-sm text-gray-500">Sending quote…</p>
          </div>
        )}

        {phase === "sent" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <Lottie
              animationData={successAnimation}
              loop={false}
              style={{ width: 220, height: 220 }}
            />
            <DialogTitle className="text-base font-semibold">Quote sent!</DialogTitle>
            <DialogDescription>Sent. {formatRecipientsLine(sentInput ?? fields)}</DialogDescription>
            <button
              type="button"
              onClick={close}
              className="mt-3 cursor-pointer rounded-sm bg-darkBlue px-6 py-2 text-sm text-white hover:bg-lightBlue"
            >
              Done
            </button>
          </div>
        )}

        {phase === "error" && (
          <>
            <DialogHeader>
              <DialogTitle>The quote was not sent</DialogTitle>
              <DialogDescription role="alert">{error}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <button
                type="button"
                onClick={close}
                className="cursor-pointer rounded-sm border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={send}
                className="cursor-pointer rounded-sm bg-darkBlue px-4 py-2 text-sm font-semibold text-white hover:bg-lightBlue"
              >
                Try again
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
