"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Asked when someone saves changes to, or deletes, a work tracker the Auto Work Trackers model made:
 * why, in their own words, so the model can learn what it got wrong. The answer is optional; the
 * save or delete goes ahead either way (Cancel stops it).
 */
export function ModelFeedbackDialog({
  kind,
  onContinue,
  onCancel,
}: {
  /** null: closed. */
  kind: "edit" | "delete" | null;
  onContinue: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (kind) setReason("");
  }, [kind]);
  const deleting = kind === "delete";

  return (
    <AlertDialog open={kind !== null} onOpenChange={(open) => !open && onCancel()}>
      {/* Above the work tracker modal, like its own save confirmation (z-[2101]). */}
      <AlertDialogContent className="z-[2101]" overlayClassName="z-[2100]">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {deleting ? "Delete this work tracker?" : "Why are you changing this trip?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The auto dispatcher made this trip. Telling it why you {deleting ? "delete" : "change"}{" "}
            it helps it plan better next time. Optional.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          autoFocus
          placeholder={
            deleting
              ? "e.g. The customer cancelled, or this move is not needed"
              : "e.g. Mike prefers to do this one, or the driver can't make it that day"
          }
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          data-testid="model-feedback-reason"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onContinue(reason)}
            className={deleting ? "bg-red-600 hover:bg-red-700" : undefined}
            data-testid="model-feedback-continue"
          >
            {deleting ? "Delete" : reason.trim() ? "Save" : "Skip and save"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
