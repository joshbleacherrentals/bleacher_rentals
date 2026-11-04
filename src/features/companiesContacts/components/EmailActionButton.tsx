"use client";

import type { LucideIcon } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { Button } from "@/components/ui/button";

/**
 * A round outlined button that writes an email (Compose, Reply, Reply all, Forward). Someone who
 * cannot send (`sendBlock` is why, see useEmailSendBlock) sees it dimmed, not hidden: pointing at
 * it shows the reason, and so does clicking it, which does nothing else. It is not `disabled`,
 * which would swallow the hover and the click that explain why.
 */
export function EmailActionButton({
  label,
  Icon,
  onClick,
  sendBlock,
}: {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
  sendBlock: string | null;
}) {
  // has-[>svg]:px-4.5 replaces the button's own 12px (it has an icon) with 18px.
  const button = (
    <Button
      type="button"
      variant="outline"
      aria-disabled={sendBlock !== null}
      onClick={sendBlock ? () => createErrorToastNoThrow([sendBlock]) : onClick}
      className={`rounded-full border-black has-[>svg]:px-4.5 ${
        sendBlock ? "cursor-not-allowed opacity-50 hover:bg-background" : ""
      }`}
    >
      <Icon />
      {label}
    </Button>
  );

  return sendBlock ? (
    <AppTooltip content={sendBlock} className="max-w-xs">
      {button}
    </AppTooltip>
  ) : (
    button
  );
}
