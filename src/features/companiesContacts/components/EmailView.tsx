"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useEmailMessage } from "../hooks/useEmailMessage";
import { useLoadEmailDetails } from "../hooks/useLoadEmailDetails";
import { buildEmailFrameDocument, EMAIL_FRAME_SANDBOX } from "../logic/emailFrame";

function HeaderLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-12 shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 break-words text-gray-700">{value}</span>
    </div>
  );
}

/**
 * One whole email, across the whole page. Its body comes from the local database; the first time an
 * email is opened it is read from Gmail and saved there, and this fills in by itself when that
 * finishes. Back (or Escape) returns to the contact's emails.
 */
export function EmailView({
  contactUuid,
  emailMessageUuid,
}: {
  contactUuid: string;
  emailMessageUuid: string;
}) {
  const router = useRouter();
  const backHref = `/contacts/${contactUuid}`;
  const { email, isLoading } = useEmailMessage(emailMessageUuid);
  const { state, load } = useLoadEmailDetails();

  // Load once per email, as soon as it is known to have no saved body.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!email || email.detailsId || !email.mailbox || !email.googleId) return;
    if (startedFor.current === email.id) return;
    startedFor.current = email.id;
    void load({ emailMessageUuid: email.id, mailbox: email.mailbox, googleId: email.googleId });
  }, [email, load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(backHref);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, backHref]);

  const date = email?.date
    ? new Date(email.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";

  return (
    <div className="flex min-h-full flex-col bg-white">
      <div className="space-y-3 border-b border-gray-200 px-6 py-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to emails
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">{email?.subject ?? "Email"}</h1>
        {email && (
          <div className="space-y-0.5">
            <HeaderLine label="From" value={email.from} />
            <HeaderLine label="To" value={email.to} />
            <HeaderLine label="Cc" value={email.cc} />
            <HeaderLine label="Date" value={date} />
          </div>
        )}
      </div>

      {/* Takes the rest of the page; the frame fills it, so the email scrolls inside it. */}
      <div className="relative min-h-96 flex-1">
        {isLoading ? (
          <p className="py-12 text-center text-sm text-gray-400">Loading...</p>
        ) : !email ? (
          <p className="py-12 text-center text-sm text-gray-400">This email is not saved.</p>
        ) : email.detailsId ? (
          email.bodyHtml ? (
            <iframe
              title={email.subject}
              sandbox={EMAIL_FRAME_SANDBOX}
              referrerPolicy="no-referrer"
              srcDoc={buildEmailFrameDocument(email.bodyHtml)}
              className="absolute inset-0 size-full border-0"
            />
          ) : email.bodyText ? (
            <pre className="max-w-4xl whitespace-pre-wrap break-words px-6 py-4 font-sans text-sm text-gray-800">
              {email.bodyText}
            </pre>
          ) : (
            <p className="py-12 text-center text-sm text-gray-400">This email has no body.</p>
          )
        ) : !email.mailbox || !email.googleId ? (
          <p className="py-12 text-center text-sm text-gray-400">
            This email has no Gmail id saved, so its body cannot be loaded.
          </p>
        ) : state.status === "error" ? (
          <div className="px-6 py-12 text-center">
            <p role="alert" className="mx-auto mb-3 max-w-md text-sm text-red-600">
              {state.message}
            </p>
            <button
              type="button"
              onClick={() =>
                void load({
                  emailMessageUuid: email.id,
                  mailbox: email.mailbox,
                  googleId: email.googleId,
                })
              }
              className="cursor-pointer rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
            <Loader2 className="size-4 animate-spin" />
            Loading the email from Gmail...
          </p>
        )}
      </div>
    </div>
  );
}
