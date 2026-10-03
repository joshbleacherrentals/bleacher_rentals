"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { setWorkTrackerGroupPaid } from "../db/workTrackerGroupPaid";

type MarkPaidButtonProps = {
  /** The week's WorkTrackerGroups row; null while the week has none, and then nothing is shown. */
  groupId: string | null;
  driverName: string;
  isPaid: boolean;
  /** `canMarkGroupPaid(...)`. When false the button is not rendered at all. */
  canMarkPaid: boolean;
  /** `sm` beside the status button in a row; `default` among the payment window's buttons. */
  size?: "sm" | "default";
};

/**
 * Marks a driver's week paid, or unpaid again. The label is the action the click performs, so it
 * reads "Mark Paid" while the week is unpaid and "Mark Unpaid" once it is paid; it follows
 * `isPaid`, which the caller reads live from the local database, so it changes as soon as the
 * write lands.
 */
export function MarkPaidButton({
  groupId,
  driverName,
  isPaid,
  canMarkPaid,
  size = "sm",
}: MarkPaidButtonProps) {
  const [isSaving, setIsSaving] = useState(false);

  if (!canMarkPaid || !groupId) return null;

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // the driver list's row navigates on click
    setIsSaving(true);
    try {
      await setWorkTrackerGroupPaid(groupId, !isPaid);
      createSuccessToast([isPaid ? "Marked as Unpaid" : "Marked as Paid", driverName]);
    } catch (error: any) {
      createErrorToastNoThrow(["Failed to update paid status", error?.message ?? ""]);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Button size={size} data-testid="mark-paid-button" disabled={isSaving} onClick={handleClick}>
      {isPaid ? "Mark Unpaid" : "Mark Paid"}
    </Button>
  );
}
