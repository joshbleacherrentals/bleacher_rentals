"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { saveQuarter } from "../db/quarters";
import { saveSprint } from "../db/sprints";
import { quarterLabel } from "../types";
import type { Quarter } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  existing?: Quarter | null;
  onSaved?: (quarterId: string) => void;
};

const CURRENT_YEAR = new Date().getFullYear();
const QUARTER_OPTIONS = [1, 2, 3, 4] as const;

function quarterStartDate(year: number, quarter: number): string {
  const month = (quarter - 1) * 3; // 0, 3, 6, 9
  return new Date(year, month, 1).toISOString().slice(0, 10);
}

function defaultSprintDates(year: number, quarter: number, sprintIndex: number) {
  const month = (quarter - 1) * 3;
  const start = new Date(year, month, 1 + sprintIndex * 14);
  const end = new Date(start);
  end.setDate(end.getDate() + 13);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function QuarterFormModal({ open, onClose, existing, onSaved }: Props) {
  const [year, setYear] = useState(existing?.year ?? CURRENT_YEAR);
  const [quarter, setQuarter] = useState<number>(existing?.quarter ?? 1);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setYear(existing?.year ?? CURRENT_YEAR);
      setQuarter(existing?.quarter ?? 1);
    }
  }, [open, existing]);

  const handleSave = async () => {
    if (year < 2000 || year > 3000 || quarter < 1 || quarter > 4) {
      createErrorToast(["Invalid year or quarter."]);
      return;
    }
    setSubmitting(true);
    try {
      const isNew = !existing;
      const quarterId = await saveQuarter({
        quarterId: existing?.id ?? null,
        year,
        quarter,
      });

      // Auto-create 6 two-week sprints for new quarters
      if (isNew) {
        for (let i = 0; i < 6; i++) {
          const { start, end } = defaultSprintDates(year, quarter, i);
          await saveSprint({
            sprintId: null,
            quarterId,
            sprintNumber: i + 1,
            startDate: start,
            endDate: end,
          });
        }
      }

      createSuccessToast(["Quarter saved"]);
      onSaved?.(quarterId);
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
      title={existing ? "Edit Quarter" : "New Quarter"}
      footer={
        <PrimaryButton loading={submitting} loadingText="Saving..." onClick={handleSave}>
          Save
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Year</span>
          <input
            type="number"
            min={2000}
            max={3000}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-greenAccent"
          />
        </label>
        <div>
          <span className="block text-sm font-medium mb-2">Quarter</span>
          <div className="grid grid-cols-4 gap-2">
            {QUARTER_OPTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuarter(q)}
                className={`py-2 rounded border text-sm font-medium cursor-pointer transition-colors ${
                  quarter === q
                    ? "bg-darkBlue text-white border-darkBlue"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                Q{q}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1.5">
            {year >= 2000 && year <= 3000 && quarter >= 1 && quarter <= 4
              ? `Creating ${quarterLabel(year, quarter)}`
              : ""}
          </p>
        </div>
        {!existing && (
          <p className="text-xs text-gray-500">
            6 two-week sprints will be created automatically. You can adjust their dates afterwards.
          </p>
        )}
      </div>
    </Modal>
  );
}
