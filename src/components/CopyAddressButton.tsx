"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { cn } from "@/lib/utils";
import { formatAddressForCopy } from "@/features/venues/logic/formatAddressForCopy";
import type { VenueAddressFields } from "@/features/venues/types";

const COPIED_MS = 1500;

/**
 * Icon button that puts an address on the clipboard. The tooltip shows with no delay and says
 * what the button does; after a click it reads "Copied!" and the icon turns into a check.
 */
export function CopyAddressButton({
  address,
  className,
}: {
  address: VenueAddressFields;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatAddressForCopy(address));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      createErrorToastNoThrow(["Failed to copy the address."]);
    }
  };

  return (
    <AppTooltip content={copied ? "Copied!" : "Copy address"}>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Copy address"
        className={cn(
          "cursor-pointer rounded p-1.5 transition-colors hover:bg-gray-100",
          copied ? "text-green-600" : "text-gray-400 hover:text-darkBlue",
          className,
        )}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </button>
    </AppTooltip>
  );
}
