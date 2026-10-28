"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEmailThread } from "../hooks/useEmailThread";
import { EmailThreadMessage } from "./EmailThreadMessage";

/**
 * An email and the rest of its thread, across the whole page: oldest at the top, newest at the
 * bottom, each as a row that opens and closes on its own. The email from the URL starts open.
 * Back (or Escape) returns to the contact's emails.
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
  const { messages, isLoading } = useEmailThread(emailMessageUuid);

  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([emailMessageUuid]));
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  // Once the thread is in, bring the email that was opened into view: older ones sit above it.
  const opened = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (isLoading || scrolled.current || !opened.current) return;
    scrolled.current = true;
    opened.current.scrollIntoView({ block: "start" });
  }, [isLoading, messages]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") router.push(backHref);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, backHref]);

  const subject = messages.find((message) => message.key === emailMessageUuid)?.subject ?? "Email";

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
        <h1 className="text-xl font-semibold text-gray-900">{subject}</h1>
        {messages.length > 1 && (
          <p className="text-sm text-gray-500">{messages.length} emails in this thread</p>
        )}
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-gray-400">Loading...</p>
      ) : messages.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">This email is not saved.</p>
      ) : (
        messages.map((message) => (
          <div key={message.key} ref={message.key === emailMessageUuid ? opened : undefined}>
            <EmailThreadMessage
              message={message}
              open={open.has(message.key)}
              onToggle={() => toggle(message.key)}
            />
          </div>
        ))
      )}
    </div>
  );
}
