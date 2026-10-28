"use client";

import { ChevronRight } from "lucide-react";
import type { ActivityEmail } from "../logic/emailActivity";
import { EmailMessageBody } from "./EmailMessageBody";

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One email of a thread: a single row (who it is from and its snippet) that opens to the whole email
 * when clicked, and closes the same way. Each row opens and closes on its own.
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
        className="flex w-full cursor-pointer items-center gap-3 px-6 py-3 text-left transition-colors hover:bg-gray-50"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span
          className={`w-48 shrink-0 truncate text-sm text-gray-900 ${open ? "font-semibold" : "font-medium"}`}
        >
          {message.from}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray-500">
          {open ? "" : message.snippet}
        </span>
        <span className="shrink-0 text-xs text-gray-400">{formatDate(message.date)}</span>
      </button>

      {open && <EmailMessageBody emailMessageUuid={message.key} />}
    </section>
  );
}
