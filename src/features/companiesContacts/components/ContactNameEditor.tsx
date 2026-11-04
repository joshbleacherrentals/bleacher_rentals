"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import {
  sameNameParts,
  trimNameParts,
  validateNameParts,
  type NameParts,
} from "../logic/contactNameEdit";

const INPUT_CLASS =
  "block w-full min-w-0 bg-transparent px-2 py-1 text-lg font-semibold text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300";

/**
 * Edits a contact's name in place. First and last name are two inputs, so there is never a guess
 * about where one ends, but they share one border, one focus ring and one pair of buttons, so
 * they read as a single field. Enter saves, Escape cancels; the buttons do the same.
 */
export function ContactNameEditor({
  initial,
  focus,
  onSave,
  onCancel,
}: {
  initial: NameParts;
  /** Which input gets the caret, so clicking the last name starts in the last name. */
  focus: "first" | "last";
  /** Throws when the save fails, which keeps the editor open. */
  onSave: (parts: NameParts) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<NameParts>(initial);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = focus === "last" ? lastRef.current : firstRef.current;
    input?.focus();
    input?.select();
    // Only on mount: later renders must not steal the caret back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const errors = validateNameParts(values);
  const error = errors.firstName ?? errors.lastName;

  const submit = async () => {
    if (saving) return;
    // Unchanged closes even if the stored name would not pass today's rules (older data).
    if (sameNameParts(values, initial)) {
      onCancel();
      return;
    }
    if (error) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    try {
      await onSave(trimNameParts(values));
    } catch {
      setSaving(false); // the caller has shown the error; keep what was typed
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return; // Enter picking an IME candidate is not a save
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1 divide-y divide-gray-200 rounded border border-gray-300 bg-white focus-within:border-lightBlue focus-within:ring-2 focus-within:ring-lightBlue/20">
          <input
            ref={firstRef}
            value={values.firstName}
            onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
            onKeyDown={onKeyDown}
            disabled={saving}
            aria-label="First name"
            aria-invalid={showErrors && !!errors.firstName}
            placeholder="First name"
            className={INPUT_CLASS}
          />
          <input
            ref={lastRef}
            value={values.lastName}
            onChange={(e) => setValues((v) => ({ ...v, lastName: e.target.value }))}
            onKeyDown={onKeyDown}
            disabled={saving}
            aria-label="Last name"
            aria-invalid={showErrors && !!errors.lastName}
            placeholder="Last name"
            className={INPUT_CLASS}
          />
        </div>

        <div className="flex flex-col">
          <AppTooltip content="Save (Enter)">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              aria-label="Save name"
              className="cursor-pointer rounded p-1 text-greenAccent transition-colors hover:bg-gray-100 disabled:opacity-40"
            >
              <Check className="size-4" />
            </button>
          </AppTooltip>
          <AppTooltip content="Cancel (Esc)">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              aria-label="Cancel"
              className="cursor-pointer rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            >
              <X className="size-4" />
            </button>
          </AppTooltip>
        </div>
      </div>

      {showErrors && error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
