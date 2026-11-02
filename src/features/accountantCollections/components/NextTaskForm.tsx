"use client";

import { useState } from "react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { NextTaskValidationError, saveNextTask, type SaveNextTaskInput } from "../db/saveNextTask";
import { daysBetween } from "../utils/calendarDays";
import { defaultNextTaskDate, NEXT_TASK_DEFAULT_NOTE } from "../utils/nextTaskDefaults";
import { validateNextTask } from "../utils/validateNextTask";
import { TaskDatePicker } from "./TaskDatePicker";

/**
 * The form inside the New Task window: the date and note of the next task, and Save (spec 06's
 * `saveNextTask`). It fills the window's body: the note takes the height the window gives it.
 * docs/specs/accountant-collections-09-design.md §3 and
 * accountant-collections-14-new-task-window.md §3.
 */

/** What the date button says: `Today`, `1 Day` or `N Days`. */
export function dueLabel(dueDate: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return "Choose a date";
  const days = daysBetween(today, dueDate);
  if (days <= 0) return "Today";
  return days === 1 ? "1 Day" : `${days} Days`;
}

/** Save is off for a blank note, an invalid or past date, and while a save runs. */
export function canSaveNextTask({
  dueDate,
  note,
  today,
  saving,
}: {
  dueDate: string;
  note: string;
  today: string;
  saving: boolean;
}): boolean {
  return !saving && validateNextTask({ dueDate, note, today }).ok;
}

/** Saves and tells the toast on failure. Resolves to whether the task was saved. */
export async function submitNextTask(input: SaveNextTaskInput): Promise<boolean> {
  try {
    await saveNextTask(input);
    return true;
  } catch (error) {
    createErrorToastNoThrow(
      error instanceof NextTaskValidationError
        ? error.errors
        : ["Could not save the next task.", error instanceof Error ? error.message : String(error)],
    );
    return false;
  }
}

export function NextTaskFormView({
  today,
  dueDate,
  note,
  saving,
  onDueDateChange,
  onNoteChange,
  onSave,
}: {
  today: string;
  dueDate: string;
  note: string;
  saving: boolean;
  onDueDateChange: (date: string) => void;
  onNoteChange: (note: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-auto p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-sm font-medium">Next Task Due:</span>
          <TaskDatePicker
            value={dueDate}
            today={today}
            label={dueLabel(dueDate, today)}
            onChange={onDueDateChange}
          />
        </div>
        <div className="flex min-h-24 flex-1 flex-col gap-1.5">
          <label htmlFor="next-task-note" className="text-sm font-medium">
            Note to self:
          </label>
          <textarea
            id="next-task-note"
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            className="min-h-16 w-full flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900"
          />
        </div>
      </div>
      <div className="flex shrink-0 justify-end px-4 pb-4">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSaveNextTask({ dueDate, note, today, saving })}
          className="h-10 rounded-md bg-darkBlue px-5 text-sm font-semibold text-white hover:bg-darkBlue/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** Mounted only while the window is open, so each opening starts from the defaults. */
export function NextTaskForm({
  eventId,
  today,
  onSaved,
}: {
  eventId: string;
  /** `YYYY-MM-DD`, the date in the timezone store. */
  today: string;
  onSaved: () => void;
}) {
  const [dueDate, setDueDate] = useState(defaultNextTaskDate(today));
  const [note, setNote] = useState(NEXT_TASK_DEFAULT_NOTE);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const saved = await submitNextTask({ eventUuid: eventId, dueDate, note, today });
    if (saved) onSaved();
    else setSaving(false);
  };

  return (
    <NextTaskFormView
      today={today}
      dueDate={dueDate}
      note={note}
      saving={saving}
      onDueDateChange={setDueDate}
      onNoteChange={setNote}
      onSave={save}
    />
  );
}
