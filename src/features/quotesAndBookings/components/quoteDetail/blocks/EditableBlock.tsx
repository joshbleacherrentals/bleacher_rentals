"use client";

import { useState, type ReactNode } from "react";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { saveBlockChanges, type BlockWrite, type SavedChange } from "./saveBlockChanges";

type Props<T> = {
  title: string;
  /** The saved value, as the page has it now. */
  value: T;
  canEdit: boolean;
  /** The rows the block writes to, and which columns of each its value fills. */
  writes: BlockWrite<T>[];
  /** Messages that stop the save; empty when the draft is fine. */
  validate?: (draft: T) => string[];
  /** Runs after the write, with what changed — for the change log and the like. */
  afterSave?: (changes: SavedChange[]) => Promise<void> | void;
  renderView: (value: T) => ReactNode;
  renderEditor: (draft: T, setDraft: (next: T) => void) => ReactNode;
};

/**
 * Wraps one block of the page. It shows the block, and while editing shows its editor with Save and
 * Cancel. Save writes only the columns that differ from the saved value (see saveBlockChanges); the
 * page follows by itself, because it reads the local database.
 */
export function EditableBlock<T>({
  title,
  value,
  canEdit,
  writes,
  validate,
  afterSave,
  renderView,
  renderEditor,
}: Props<T>) {
  // null while the block is only being read.
  const [draft, setDraft] = useState<T | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (draft === null) return;
    const errors = validate?.(draft) ?? [];
    if (errors.length > 0) {
      createErrorToastNoThrow(errors);
      return;
    }
    setSaving(true);
    try {
      const changes = await saveBlockChanges(writes, value, draft);
      await afterSave?.(changes);
      if (changes.length > 0) createSuccessToast([`${title} saved.`]);
      setDraft(null);
    } catch (error) {
      createErrorToastNoThrow([(error as Error).message || `Could not save ${title}.`]);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = () => setDraft(value);
  const clickable = canEdit && draft === null;

  return (
    <section
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={
        clickable
          ? (e) => {
              // A click inside a dialog opened from the block bubbles here through React's tree
              // although it is elsewhere in the page; only clicks on the block itself count.
              if (e.currentTarget.contains(e.target as Node)) startEditing();
            }
          : undefined
      }
      onKeyDown={
        clickable
          ? (e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                startEditing();
              }
            }
          : undefined
      }
      className={
        clickable
          ? "block rounded-md -m-3 p-3 cursor-pointer hover:bg-gray-50 transition text-left"
          : undefined
      }
    >
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>

      {draft === null ? (
        renderView(value)
      ) : (
        <div>
          {renderEditor(draft, setDraft)}
          <div className="flex items-center justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setDraft(null)}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-semibold text-white bg-darkBlue rounded-sm hover:bg-lightBlue transition cursor-pointer disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
