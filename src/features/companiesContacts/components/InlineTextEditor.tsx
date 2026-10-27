"use client";

import { useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import { Textarea } from "@/components/TextArea";

/**
 * Edits one value in place: an input with a check and an X beside it. Escape cancels; the
 * buttons do the same. Enter saves a single-line value; a `multiline` value is a resizable
 * textarea where Enter starts a new line and Ctrl/⌘+Enter saves. Saving an unchanged value just
 * closes the editor, and a value that fails `validate` stays open with the reason underneath.
 */
export function InlineTextEditor({
  initial,
  label,
  placeholder,
  type = "text",
  multiline = false,
  validate,
  onSave,
  onCancel,
}: {
  initial: string;
  /** Accessible name for the field, and the wording of the save button's label. */
  label: string;
  placeholder?: string;
  type?: "text" | "email" | "tel";
  multiline?: boolean;
  /** The reason the value cannot be saved, or null. */
  validate: (value: string) => string | null;
  /** Throws when the save fails, which keeps the editor open. */
  onSave: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [showError, setShowError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (areaRef.current) {
      // Long text: the caret goes to the end so typing continues where the note stops.
      areaRef.current.focus();
      areaRef.current.setSelectionRange(initial.length, initial.length);
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    // Only on mount: later renders must not steal the caret back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const error = validate(value);

  const submit = async () => {
    if (saving) return;
    if (value.trim() === initial.trim()) {
      onCancel();
      return;
    }
    if (error) {
      setShowError(true);
      return;
    }
    setSaving(true);
    try {
      await onSave(value.trim());
    } catch {
      setSaving(false); // the caller has shown the error; keep what was typed
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing) return; // Enter picking an IME candidate is not a save
    if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const field = {
    value,
    onKeyDown,
    disabled: saving,
    "aria-label": label,
    "aria-invalid": showError && !!error,
    placeholder,
  };

  return (
    <div>
      <div className={multiline ? "flex items-start gap-1" : "flex items-center gap-1"}>
        {multiline ? (
          <Textarea
            ref={areaRef}
            {...field}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 bg-white text-gray-900 focus-visible:ring-2 focus-visible:ring-lightBlue/30"
          />
        ) : (
          <input
            ref={inputRef}
            type={type}
            {...field}
            onChange={(e) => setValue(e.target.value)}
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-lightBlue focus:ring-2 focus:ring-lightBlue/20"
          />
        )}

        <div className={multiline ? "flex flex-col" : "flex items-center gap-1"}>
          <AppTooltip content={multiline ? "Save (Ctrl/⌘+Enter)" : "Save (Enter)"}>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              aria-label={`Save ${label.toLowerCase()}`}
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

      {showError && error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
