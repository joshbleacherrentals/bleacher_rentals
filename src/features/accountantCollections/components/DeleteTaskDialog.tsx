"use client";

import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/features/quotesAndBookings/utils/eventFileUpload";

/**
 * The "Are you sure?" window of the delete button in Task History. It closes on No, on the X, on
 * Esc and on a click outside the window (the project's `Dialog` does the last three), and closing
 * it changes nothing. No has the focus when it opens. While the delete runs both buttons are
 * disabled and a request to close is ignored, so Esc cannot hide a delete in progress.
 * docs/specs/accountant-collections-19-task-delete.md §1, §3 and §7.
 */

// The window of docs/design/accountant-collections/Invoice.dc.html: 400 px wide, buttons 38 px high.
const BUTTON =
  "inline-flex h-[38px] cursor-pointer items-center justify-center rounded-md px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

/**
 * The click on Yes: delete the task, then close the window. A failed delete shows the toast
 * `Could not delete the task` with the reason and still closes the window; the row stays, since
 * nothing was written. It never throws.
 */
export async function runTaskDelete({
  taskId,
  now,
  deleteTask,
  close,
  showError,
}: {
  taskId: string;
  /** An ISO string, made by the caller. */
  now: string;
  deleteTask: (input: { taskId: string; now: string }) => Promise<void>;
  close: () => void;
  showError: (lines: string[]) => void;
}): Promise<void> {
  try {
    await deleteTask({ taskId, now });
  } catch (err) {
    showError(["Could not delete the task", errorMessage(err)]);
  } finally {
    close();
  }
}

export function DeleteTaskDialog({
  number,
  busy,
  onConfirm,
  onClose,
}: {
  /** The number of the row to delete, as the table shows it; null while no task is chosen. */
  number: number | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const noRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={number !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="gap-3 rounded-[10px] p-5 sm:max-w-[400px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          noRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-base leading-6">Are you sure?</DialogTitle>
          <DialogDescription className="text-gray-600">
            Task #{number} will be deleted from the history.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-end">
          <button
            ref={noRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            className={`${BUTTON} border border-darkBlue bg-white text-darkBlue hover:bg-blue-50`}
          >
            No
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`${BUTTON} bg-[#a8403a] text-white hover:bg-[#8f3631]`}
          >
            Yes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
