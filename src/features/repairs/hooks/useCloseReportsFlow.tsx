"use client";

import { useCallback, useRef, useState, type ReactElement } from "react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { readCloseCandidates, type CloseCandidatesInput } from "../db/closeCandidatesRead";
import { changeRepairStatus } from "../db/repairStatusWrite";
import { CloseReportsDialog } from "../components/CloseReportsDialog";
import { NO_CLOSING, type CloseCandidate, type CloseChoice } from "../utils/closeReports";
import type { RepairListRow, RepairStatus } from "../utils/repairRows";

/**
 * The flow that asks which damage reports to close: read the candidates once, open the dialog when
 * there is any, and resolve the person's choice. A page mounts it once and draws its `dialog`; the
 * status menus and the writers of the windows go through it. Cancel (the button, Esc, a click outside)
 * rejects with `CloseChoiceCancelled`, which the writers let through and the existing `catch` of each
 * window swallows, so the window stays as it is and nothing is written.
 * docs/specs/repairs-08a-choose-reports-to-close.md §2.3 and §3 (D238 to D250).
 */

export class CloseChoiceCancelled extends Error {
  constructor() {
    super("Closing the damage reports was cancelled.");
    this.name = "CloseChoiceCancelled";
  }
}

type Asking = {
  candidates: CloseCandidate[];
  resolve: (choice: CloseChoice) => void;
  reject: (error: unknown) => void;
};

export function useCloseReportsFlow(): {
  /** The menu entry of a row or of the repair window (spec 08). Never rejects; shows its own toast. */
  changeStatus: (repair: RepairListRow, to: RepairStatus) => void;
  /** For a writer: reads, asks if needed, resolves the choice, rejects `CloseChoiceCancelled` on Cancel. */
  chooseClosing: (input: Omit<CloseCandidatesInput, "timezone">) => Promise<CloseChoice>;
  /** Mount it once where the hook is used; null while nothing is asked. */
  dialog: ReactElement | null;
} {
  const timezone = useTimezoneStore((s) => s.timezone);
  const [asking, setAsking] = useState<Asking | null>(null);
  // One question at a time: a second action while the first is still reading or asking is ignored.
  const busy = useRef(false);

  const chooseClosing = useCallback(
    async (input: Omit<CloseCandidatesInput, "timezone">): Promise<CloseChoice> => {
      if (busy.current) throw new CloseChoiceCancelled();
      busy.current = true;
      try {
        const candidates = await readCloseCandidates({ ...input, timezone });
        if (candidates.length === 0) return NO_CLOSING;
        // The status menu is closing as the dialog opens: let it finish first.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return await new Promise<CloseChoice>((resolve, reject) => {
          setAsking({ candidates, resolve, reject });
        });
      } finally {
        busy.current = false;
      }
    },
    [timezone],
  );

  const changeStatus = useCallback(
    (repair: RepairListRow, to: RepairStatus) => {
      void (async () => {
        let closing: CloseChoice;
        try {
          closing = await chooseClosing({
            repairId: repair.id,
            fromStatus: repair.status,
            toStatus: to,
            eventEnd: repair.eventEnd,
            bleachersBefore: [],
            bleachersAfter: [],
          });
        } catch (e) {
          if (e instanceof CloseChoiceCancelled) return;
          createErrorToastNoThrow(["Failed to change the status.", String(e)]);
          return;
        }
        // One clock reading is the moment of the whole change: the Confirm click, or now when nobody
        // was asked (spec 08 D112, D116; 08a D239). The writer shows its own error toast (D119).
        await changeRepairStatus({
          repairId: repair.id,
          from: repair.status,
          to,
          closeLinkedIds: closing.closeLinkedIds,
          unlinkLinkedIds: closing.unlinkLinkedIds,
          now: closing.confirmedAt ?? new Date().toISOString(),
        });
      })().catch(() => {});
    },
    [chooseClosing],
  );

  const settle = (finish: (current: Asking) => void) => {
    if (!asking) return;
    const current = asking;
    setAsking(null);
    finish(current);
  };

  const dialog = asking ? (
    <CloseReportsDialog
      candidates={asking.candidates}
      onCancel={() => settle((current) => current.reject(new CloseChoiceCancelled()))}
      onConfirm={(choice) => settle((current) => current.resolve(choice))}
    />
  ) : null;

  return { changeStatus, chooseClosing, dialog };
}
