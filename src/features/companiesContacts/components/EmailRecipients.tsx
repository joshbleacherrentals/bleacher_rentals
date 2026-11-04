"use client";

import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ThreadMessage } from "../hooks/useEmailThread";
import { addressLines } from "../logic/emailActivity";

function Detail({ label, lines }: { label: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <dt className="text-xs text-gray-400">{label}</dt>
      {lines.map((line, i) => (
        <dd key={i} className="break-words text-gray-800">
          {line}
        </dd>
      ))}
    </div>
  );
}

/**
 * "To Josh Redgrift" with a small arrow: opens the email's From, To, Cc and date in full. Bcc is
 * not shown, since it is not saved. It has to sit above the row's own click-to-close layer, which
 * is why it is positioned.
 */
export function EmailRecipients({
  message,
  dateText,
}: {
  message: ThreadMessage;
  dateText: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative z-10 inline-flex max-w-full cursor-pointer items-center gap-1 rounded text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <span className="min-w-0 truncate">To {message.to || "undisclosed recipients"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] text-sm">
        <dl className="space-y-3">
          <Detail label="From" lines={addressLines(message.fromHeader)} />
          <Detail label="To" lines={addressLines(message.toHeader)} />
          <Detail label="Cc" lines={addressLines(message.ccHeader)} />
          <Detail label="Date" lines={dateText ? [dateText] : []} />
        </dl>
      </PopoverContent>
    </Popover>
  );
}
