"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useEmailMessage } from "../hooks/useEmailMessage";
import { useLoadEmailDetails } from "../hooks/useLoadEmailDetails";
import {
  buildEmailFrameDocument,
  EMAIL_FRAME_HEIGHT_MESSAGE,
  EMAIL_FRAME_SANDBOX,
} from "../logic/emailFrame";
import { splitQuotedText } from "../logic/emailQuotes";

const MIN_FRAME_HEIGHT = 120;
const MAX_FRAME_HEIGHT = 40_000;
// An email sized to its window (min-height: 100vh) grows the frame, which grows the email, and so
// on. After this many reports the frame stops following, which ends that loop; real emails send a
// handful.
const MAX_HEIGHT_REPORTS = 40;

function HeaderLine({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-12 shrink-0 text-gray-400">{label}</span>
      <span className="min-w-0 break-words text-gray-700">{value}</span>
    </div>
  );
}

/** An email's HTML in its sandboxed frame, as tall as the email so the page scrolls, not the frame. */
function EmailHtmlFrame({ title, html }: { title: string; html: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(MIN_FRAME_HEIGHT);
  // Once per email: a new document (it carries a new nonce) would reload the frame.
  const srcDoc = useMemo(() => buildEmailFrameDocument(html), [html]);

  useEffect(() => {
    let reports = 0;
    const onMessage = (event: MessageEvent) => {
      // Only the frame's own report counts, and only its height is used.
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type !== EMAIL_FRAME_HEIGHT_MESSAGE) return;
      const reported = Number(event.data.height);
      if (!Number.isFinite(reported) || reports++ >= MAX_HEIGHT_REPORTS) return;
      setHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(reported))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [srcDoc]);

  // The email's text starts 12px inside the frame (its body margin), so the frame is inset 12px
  // short of where the row above puts the sender (pl-18: see EmailMessageBody) and, on the right,
  // 12px short of the row's px-6, which lines the body up with the header.
  return (
    <div className="pl-15 pr-3">
      <iframe
        ref={frame}
        title={title}
        sandbox={EMAIL_FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        style={{ height }}
        className="block w-full border-0"
      />
    </div>
  );
}

/**
 * One email's addresses and body. The body comes from the local database; the first time an email
 * is shown it is read from Gmail and saved there, and this fills in by itself when that finishes.
 * Mount it only when the email is open: that is what keeps a thread's closed emails from loading.
 *
 * Everything here is indented 4.5rem (pl-18, or pl-15 plus the frame's 12px margin) so it lines up
 * under the sender's name in the row above: px-6, the 2.25rem avatar and its 0.75rem gap.
 */
export function EmailMessageBody({ emailMessageUuid }: { emailMessageUuid: string }) {
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

  const date = email?.date
    ? new Date(email.date).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "";

  return (
    <div>
      {email && (
        <div className="space-y-0.5 px-6 pb-3 pl-18">
          <HeaderLine label="From" value={email.from} />
          <HeaderLine label="To" value={email.to} />
          <HeaderLine label="Cc" value={email.cc} />
          <HeaderLine label="Date" value={date} />
        </div>
      )}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
      ) : !email ? (
        <p className="py-6 text-center text-sm text-gray-400">This email is not saved.</p>
      ) : email.detailsId ? (
        email.bodyHtml ? (
          <EmailHtmlFrame title={email.subject} html={email.bodyHtml} />
        ) : email.bodyText ? (
          <div className="max-w-4xl px-6 py-2 pl-18 text-sm text-gray-800">
            {splitQuotedText(email.bodyText).map((part, i) =>
              part.quoted ? (
                <details key={i} className="my-2">
                  <summary
                    title="Show quoted text"
                    aria-label="Show quoted text"
                    className="inline-block cursor-pointer list-none select-none rounded-full bg-gray-100 px-2 text-xs leading-4 tracking-widest text-gray-500 hover:bg-gray-200 [&::-webkit-details-marker]:hidden"
                  >
                    •••
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-gray-500">
                    {part.text}
                  </pre>
                </details>
              ) : (
                <pre key={i} className="whitespace-pre-wrap break-words font-sans">
                  {part.text}
                </pre>
              ),
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">This email has no body.</p>
        )
      ) : !email.mailbox || !email.googleId ? (
        <p className="py-6 text-center text-sm text-gray-400">
          This email has no Gmail id saved, so its body cannot be loaded.
        </p>
      ) : state.status === "error" ? (
        <div className="px-6 py-6 text-center">
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
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500">
          <Loader2 className="size-4 animate-spin" />
          Loading the email from Gmail...
        </p>
      )}
    </div>
  );
}
