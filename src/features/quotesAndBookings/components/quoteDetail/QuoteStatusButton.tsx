"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../../database.types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { changeQuoteStatus } from "../../db/changeQuoteStatus";
import type { QuoteStatus } from "../../types/quoteTypes";
import { validateLostReason, type LostReason } from "../../utils/lostReason";
import { allowedStatuses, statusLabel } from "../../utils/statusTransitions";
import { LostReasonFields } from "../lostReason/LostReasonFields";

/** The colour of each status: the button, and its entry in the list. */
const STATUS_COLORS: Record<QuoteStatus, string> = {
  draft: "bg-[rgb(254,218,120)] text-white",
  quoted: "bg-[rgb(78,149,255)] text-white",
  booked: "bg-[rgb(61,196,165)] text-white",
  unsigned_changes: "bg-[rgb(222,78,93)] text-white",
  lost: "bg-[rgb(62,82,90)] text-white",
};

const colorOf = (status: string | null) =>
  STATUS_COLORS[status as QuoteStatus] ?? STATUS_COLORS.draft;

/**
 * The quote's status, drawn in its colour. Clicking it lists the statuses the quote may become
 * (utils/statusTransitions); picking one saves it, and Lost first asks why. Without `canChange`
 * it is only a badge.
 */
export function QuoteStatusButton({
  eventId,
  status,
  canChange,
  supabase,
  userId,
}: {
  eventId: string;
  status: string | null;
  canChange: boolean;
  supabase: SupabaseClient<Database>;
  userId: string | null;
}) {
  const [saving, setSaving] = useState(false);
  const [askLostReason, setAskLostReason] = useState(false);
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState("");

  const save = async (to: QuoteStatus, lost?: { reason: LostReason; note: string }) => {
    setSaving(true);
    try {
      await changeQuoteStatus(
        { eventId, from: status, to, lostReason: lost?.reason, lostReasonNote: lost?.note },
        supabase,
        userId,
      );
      createSuccessToast([`Status changed to ${statusLabel(to)}.`]);
      setAskLostReason(false);
    } catch (error) {
      createErrorToastNoThrow([(error as Error).message || "Could not change the status."]);
    } finally {
      setSaving(false);
    }
  };

  const pick = (to: QuoteStatus) => {
    if (to === status) return;
    if (to === "lost") {
      setReason(null);
      setNote("");
      setAskLostReason(true);
      return;
    }
    void save(to);
  };

  const confirmLost = () => {
    const errors = validateLostReason({ status: "lost", lostReason: reason, lostReasonNote: note });
    if (errors.length > 0) {
      createErrorToastNoThrow(errors);
      return;
    }
    void save("lost", { reason: reason!, note });
  };

  const badge = `flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-sm ${colorOf(status)}`;

  if (!canChange) return <span className={badge}>{statusLabel(status)}</span>;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={saving}
          className={`${badge} cursor-pointer disabled:opacity-50`}
        >
          {statusLabel(status)}
          <ChevronDown className="w-3.5 h-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {allowedStatuses(status).map((option) => (
            <DropdownMenuItem
              key={option}
              disabled={option === status}
              onSelect={() => pick(option)}
              className="cursor-pointer"
            >
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorOf(option)}`} />
              {statusLabel(option)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={askLostReason} onOpenChange={(open) => !saving && setAskLostReason(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Lost</DialogTitle>
          </DialogHeader>
          <LostReasonFields
            reason={reason}
            note={note}
            onReasonChange={setReason}
            onNoteChange={setNote}
          />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setAskLostReason(false)}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmLost}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-red-600 rounded-sm hover:bg-red-700 transition cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving..." : "Mark as Lost"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
