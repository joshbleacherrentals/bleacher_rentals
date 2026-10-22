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
import { statusLabel } from "../../utils/statusTransitions";
import {
  displayState,
  displayStateLabel,
  displayStateOptions,
  type DisplayState,
} from "../../utils/leadResponseState";
import { setLeadResponded } from "../../db/setLeadResponded";
import { useNow } from "../../hooks/useNow";
import { formatWait } from "../../utils/formatWait";
import { LostReasonFields } from "../lostReason/LostReasonFields";

/** The colour of each status: the button, and its entry in the list. */
const STATUS_COLORS: Record<DisplayState, string> = {
  awaiting_response: "bg-red-600 text-white",
  responded: "bg-[rgb(254,218,120)] text-white",
  draft: "bg-[rgb(254,218,120)] text-white",
  quoted: "bg-[rgb(78,149,255)] text-white",
  booked: "bg-[rgb(61,196,165)] text-white",
  unsigned_changes: "bg-[rgb(222,78,93)] text-white",
  lost: "bg-[rgb(62,82,90)] text-white",
};

const colorOf = (status: string | null) =>
  STATUS_COLORS[status as DisplayState] ?? STATUS_COLORS.draft;

/** How long the website request has waited, counting up; only mounted while it is waiting. */
function WaitTimer({ since }: { since: string }) {
  const now = useNow();
  const ms = Date.parse(since);
  if (Number.isNaN(ms)) return null;
  return <span className="tabular-nums font-normal">{formatWait(now - ms)}</span>;
}

/**
 * The quote's status, drawn in its colour. Clicking it lists the statuses the quote may become
 * (utils/statusTransitions); picking one saves it, and Lost first asks why. Without `canChange`
 * it is only a badge.
 */
export function QuoteStatusButton({
  eventId,
  status: storedStatus,
  hasLeadSubmission,
  hideLeadAlert,
  createdAt,
  canChange,
  supabase,
  userId,
}: {
  eventId: string;
  status: string | null;
  /** The quote came from the website form. */
  hasLeadSubmission: boolean;
  /** The website request has been answered. */
  hideLeadAlert: boolean;
  /** When the quote was created, which is when a website request arrived. */
  createdAt: string;
  canChange: boolean;
  supabase: SupabaseClient<Database>;
  userId: string | null;
}) {
  const status = displayState({ status: storedStatus, hasLeadSubmission, hideLeadAlert });
  const [saving, setSaving] = useState(false);
  const [askLostReason, setAskLostReason] = useState(false);
  const [reason, setReason] = useState<LostReason | null>(null);
  const [note, setNote] = useState("");

  const save = async (to: QuoteStatus, lost?: { reason: LostReason; note: string }) => {
    setSaving(true);
    try {
      await changeQuoteStatus(
        { eventId, from: storedStatus, to, lostReason: lost?.reason, lostReasonNote: lost?.note },
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

  const saveLeadResponded = async (responded: boolean) => {
    setSaving(true);
    try {
      await setLeadResponded(eventId, responded);
      createSuccessToast([
        responded ? "Marked as responded." : "Marked as waiting for a response.",
      ]);
    } catch (error) {
      createErrorToastNoThrow([(error as Error).message || "Could not change the status."]);
    } finally {
      setSaving(false);
    }
  };

  const pick = (to: DisplayState) => {
    if (to === status) return;
    if (to === "responded" || to === "awaiting_response") {
      void saveLeadResponded(to === "responded");
      return;
    }
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

  const label = (
    <>
      {displayStateLabel(status)}
      {status === "awaiting_response" && <WaitTimer since={createdAt} />}
    </>
  );

  if (!canChange) return <span className={badge}>{label}</span>;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={saving}
          className={`${badge} cursor-pointer disabled:opacity-50`}
        >
          {label}
          <ChevronDown className="w-3.5 h-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {displayStateOptions(status).map((option) => (
            <DropdownMenuItem
              key={option}
              disabled={option === status}
              onSelect={() => pick(option)}
              className="cursor-pointer"
            >
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${colorOf(option)}`} />
              {displayStateLabel(option)}
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
