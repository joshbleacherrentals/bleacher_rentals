"use client";

import { ChevronRight } from "lucide-react";
import type { ActivityEmail } from "../logic/emailActivity";
import { EmailMessageBody } from "./EmailMessageBody";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One email of a thread: a row with an arrow, who it is from and when, and under the name a line of
 * its snippet. Clicking it opens the whole email, and clicking again closes it. Each row opens and
 * closes on its own. An open email drops the snippet, since the email itself is right below.
 */
export function EmailThreadMessage({
  message,
  open,
  onToggle,
}: {
  message: ActivityEmail;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="border-b border-gray-200">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-start gap-3 px-6 py-3 text-left transition-colors hover:bg-gray-50"
      >
        {/* mt-0.5 centers the arrow on the name's line (20px tall; the arrow is 16px). */}
        <ChevronRight
          className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span
              className={`truncate text-sm text-gray-900 ${open ? "font-semibold" : "font-medium"}`}
            >
              {message.from}
            </span>
            <span className="shrink-0 text-xs text-gray-400">{formatDate(message.date)}</span>
          </span>
          {!open && <span className="block truncate text-sm text-gray-500">{message.snippet}</span>}
        </span>
      </button>

      {open && <EmailMessageBody emailMessageUuid={message.key} />}
    </section>
  );
}
