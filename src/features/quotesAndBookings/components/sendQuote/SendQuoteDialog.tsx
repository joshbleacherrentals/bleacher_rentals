"use client";

import { useEffect, useState } from "react";
import Lottie from "lottie-react";
import { ExternalLink, Loader2, Monitor, Paperclip, Smartphone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchSendPreview, type SendPreview } from "../../utils/sendQuote";
import { canDismiss, canSend, runSend, type SendPhase } from "./sendQuoteFlow";
import successAnimation from "../../../../../public/animations/Success.json";

export type SendQuoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Must already be saved: the PDF and email preview are built from the stored quote. */
  eventId: string;
  recipientEmails: string[];
  /** Create flow: runs just before the email, e.g. to mark the quote Quoted. */
  onBeforeSend?: () => Promise<void>;
  /** Runs after the email is confirmed sent — logs it and does any page cleanup. */
  onSent: () => Promise<void> | void;
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
  const recipientKey = recipientEmails.join(",");

  useEffect(() => {
    if (!open) return;
    setPhase("review");
    setError("");
    setPreview(null);
    setMobileView(false);
    if (recipientEmails.length === 0) return;
    let cancelled = false;
    void fetchSendPreview(eventId, recipientEmails).then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId, recipientKey]);

  const close = () => {
    if (!canDismiss(phase)) return;
    // onDone first: the parent may still need what it clears when it handles onOpenChange.
    if (phase === "sent") onDone?.();
    onOpenChange(false);
  };

  const send = async () => {
    setPhase("sending");
    const result = await runSend({ eventId, recipients: recipientEmails, onBeforeSend, onSent });
    if (result.ok) {
      setPhase("sent");
    } else {
      setError(result.message);
      setPhase("error");
    }
  };

  const sendable = canSend({ recipients: recipientEmails, preview });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-4 rounded-none border-0 sm:max-w-none"
        onEscapeKeyDown={(e) => !canDismiss(phase) && e.preventDefault()}
      >
        {phase === "review" && (
          <div className="grid min-h-0 flex-1 gap-6 md:grid-cols-[25%_1fr]">
            <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Review before sending</DialogTitle>
                <DialogDescription>
                  This is exactly what your customer will receive. Nothing is sent until you press
                  Send.
                </DialogDescription>
              </DialogHeader>

              {preview?.ok && (
                <>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-xs font-semibold text-gray-500">From</dt>
                      <dd className="break-all">{preview.from}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-500">To</dt>
                      <dd className="break-all">{preview.to.split(",").join(", ")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-gray-500">Subject</dt>
                      <dd className="font-medium">{preview.subject}</dd>
                    </div>
                  </dl>

                  <div className="flex gap-1">
                    {(
                      [
                        { mobile: false, label: "Desktop", Icon: Monitor },
                        { mobile: true, label: "Mobile", Icon: Smartphone },
                      ] as const
                    ).map(({ mobile, label, Icon }) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={mobileView === mobile}
                        onClick={() => setMobileView(mobile)}
                        className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition ${
                          mobileView === mobile
                            ? "border-darkBlue bg-darkBlue text-white"
                            : "border-gray-300 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>

                  <section aria-labelledby="send-attachments-heading">
                    <h3
                      id="send-attachments-heading"
                      className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-500"
                    >
                      Attachments ({preview.attachments.length})
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {preview.attachments.map((file) => (
                        <li key={file.url}>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-darkBlue transition hover:border-lightBlue hover:bg-gray-50 hover:underline"
                          >
                            <Paperclip className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 break-all">{file.name}</span>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

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
                  onClick={send}
                  disabled={!sendable}
                  className="flex-1 cursor-pointer rounded-sm bg-darkBlue px-4 py-2 text-sm font-semibold text-white hover:bg-lightBlue disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>

            <div className="flex min-h-[24rem] min-w-0 flex-col">
              {recipientEmails.length === 0 ? (
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
            <DialogDescription>Sent to {recipientEmails.join(", ")}</DialogDescription>
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
