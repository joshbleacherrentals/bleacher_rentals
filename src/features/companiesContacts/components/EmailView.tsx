"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Forward, Reply, ReplyAll } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEmailThread } from "../hooks/useEmailThread";
import { EmailThreadMessage } from "./EmailThreadMessage";
import { ReplyBox } from "./ReplyBox";

/**
 * An email and the rest of its thread, across the whole page: oldest at the top, newest at the
 * bottom, each as a row that opens and closes on its own. The email from the URL starts open.
 * Back (or Escape, unless typing) returns to the contact's emails. A footer of Reply, Reply all and
 * Forward stays in view at the bottom of the page while the thread scrolls; Reply swaps the buttons
 * for a box to write in, pinned to the bottom right (nothing is sent yet, and there is no way to
 * put the buttons back yet). Reply all and Forward do nothing so far.
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

  // Whether the footer shows the reply box instead of its buttons.
  const [replying, setReplying] = useState(false);
  // The footer's buttons, in order. Only Reply does anything so far.
  const footerActions = [
    { label: "Reply", Icon: Reply, onClick: () => setReplying(true) },
    { label: "Reply all", Icon: ReplyAll, onClick: undefined },
    { label: "Forward", Icon: Forward, onClick: undefined },
  ];

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
      // Not while typing a reply: Escape there must not throw the draft away.
      const typing = event.target instanceof Element && event.target.closest("textarea, input");
      if (event.key === "Escape" && !typing) router.push(backHref);
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

      {/*
        Both stick to the bottom of the scrolling page, and mt-auto keeps them at the bottom of a
        short one. The footer's buttons are replaced by the reply box once Reply is pressed: a
        square card at the bottom right (ml-auto): w-170 by h-170 (42.5rem), but never wider than the
        page nor taller than the window (the max- limits), so it can always be seen whole.
        pl-18 is where the sender's name and the email's text start (see EmailMessageBody).
      */}
      {messages.length > 0 &&
        (replying ? (
          <div className="sticky bottom-4 z-10 ml-auto mr-6 mt-auto h-170 max-h-[calc(100vh-8rem)] w-170 max-w-[calc(100%-3rem)]">
            <ReplyBox replyingTo={messages[messages.length - 1]} />
          </div>
        ) : (
          <div className="sticky bottom-0 z-10 mt-auto flex flex-wrap gap-2 border-t border-gray-200 bg-white pb-5 pl-18 pr-6 pt-3">
            {footerActions.map(({ label, Icon, onClick }) => (
              // has-[>svg]:px-4.5 replaces the button's own 12px (it has an icon) with 18px.
              <Button
                key={label}
                type="button"
                variant="outline"
                onClick={onClick}
                className="rounded-full border-black has-[>svg]:px-4.5"
              >
                <Icon />
                {label}
              </Button>
            ))}
          </div>
        ))}
    </div>
  );
}
