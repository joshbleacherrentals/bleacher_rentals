"use client";

import { useState } from "react";
import { BadgeCheck, CircleDollarSign } from "lucide-react";
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

// Unpaid is the quiet, default state of every week, so it is a plain outline. Paid is the state
// worth finding at a glance down a list of drivers, so it is solid green — heavier than the pale
// green of the "Ready for Payment" status button beside it, which it must not be mistaken for.
const LOOK = {
  unpaid: {
    icon: CircleDollarSign,
    label: "Mark Paid",
    title: "Unpaid — click to mark this week paid",
    className: "border-slate-300 text-slate-700 hover:bg-slate-100",
  },
  paid: {
    icon: BadgeCheck,
    label: "Mark Unpaid",
    title: "Paid — click to mark this week unpaid",
    className: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 hover:text-white",
  },
} as const;

/**
 * Marks a driver's week paid, or unpaid again. The label is the action the click performs, so it
 * reads "Mark Paid" while the week is unpaid and "Mark Unpaid" once it is paid; the colour and
 * icon say which state the week is in. It follows `isPaid`, which the caller reads live from the
 * local database, so it changes as soon as the write lands.
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

  const look = isPaid ? LOOK.paid : LOOK.unpaid;
  const Icon = look.icon;

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
    <Button
      variant="outline"
      size={size}
      data-testid="mark-paid-button"
      data-paid={isPaid ? "true" : "false"}
      title={look.title}
      className={look.className}
      disabled={isSaving}
      onClick={handleClick}
    >
      <Icon />
      {look.label}
    </Button>
  );
}
