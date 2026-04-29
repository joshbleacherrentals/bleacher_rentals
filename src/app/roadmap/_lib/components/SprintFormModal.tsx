"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { saveSprint } from "../db/sprints";
import type { Sprint } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  quarterId: string;
  existing?: Sprint | null;
};

export function SprintFormModal({ open, onClose, quarterId, existing }: Props) {
  const [sprintNumber, setSprintNumber] = useState<number>(existing?.sprint_number ?? 1);
  const [startDate, setStartDate] = useState(existing?.start_date ?? "");
  const [endDate, setEndDate] = useState(existing?.end_date ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setSprintNumber(existing?.sprint_number ?? 1);
      setStartDate(existing?.start_date ?? "");
      setEndDate(existing?.end_date ?? "");
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (!startDate || !endDate || sprintNumber < 1 || sprintNumber > 6) {
      createErrorToast(["Please fill all fields. Sprint number must be 1–6."]);
      return;
    }
    setSubmitting(true);
    try {
      await saveSprint({
        sprintId: existing?.id ?? null,
        quarterId,
        sprintNumber,
        startDate,
        endDate,
      });
      createSuccessToast(["Sprint saved"]);
      onClose();
    } catch (err: any) {
      createErrorToast(["Save failed", err.message ?? String(err)]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? "Edit Sprint" : "New Sprint"}
      footer={
        <PrimaryButton loading={submitting} loadingText="Saving..." onClick={handleSave}>
          Save
        </PrimaryButton>
      }
    >
      <div className="space-y-3">
        <label className="block text-sm">
          <span className="font-medium">Sprint #</span>
          <input
            type="number"
            min={1}
            max={6}
            value={sprintNumber}
            onChange={(e) => setSprintNumber(Number(e.target.value))}
            className="mt-1 w-full px-3 py-2 border rounded text-sm"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="font-medium">Start date</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium">End date</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded text-sm"
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}
