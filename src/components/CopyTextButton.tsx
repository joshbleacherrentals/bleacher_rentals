"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { cn } from "@/lib/utils";

const COPIED_MS = 1500;

/**
 * Icon button that puts a piece of text on the clipboard. `label` names what is copied ("email"),
 * for the tooltip, the accessible name and the error toast. After a click the icon turns into a
 * check and the tooltip reads "Copied!".
 */
export function CopyTextButton({
  text,
  label,
  className,
}: {
  text: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      createErrorToastNoThrow([`Failed to copy the ${label}.`]);
    }
  };

  return (
    <AppTooltip content={copied ? "Copied!" : `Copy ${label}`}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copy ${label}`}
        className={cn(
          "cursor-pointer rounded p-1 transition-colors hover:bg-gray-100",
          copied ? "text-green-600" : "text-gray-400 hover:text-darkBlue",
          className,
        )}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </AppTooltip>
  );
}
