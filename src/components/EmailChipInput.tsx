"use client";

import { useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { RecipientField, RecipientFields } from "@/features/quotesAndBookings/utils/sendQuote";
import {
  chipKeyAction,
  commitDraft,
  filterSuggestions,
  pickSuggestion,
  removeChip,
  removeLastChip,
  type ContactSuggestion,
} from "./EmailChipInput.logic";

export type { ContactSuggestion } from "./EmailChipInput.logic";

type Props = {
  /** Visible label, also the accessible name of the input ("To", "Cc", "Bcc"). */
  label: string;
  /** Which of the three address lists this input edits. All three are needed so that an address
   *  already present anywhere can be refused. */
  field: RecipientField;
  fields: RecipientFields;
  onFieldsChange: (next: RecipientFields) => void;
  suggestions?: ContactSuggestion[];
  disabled?: boolean;
};

/**
 * Addresses as removable chips. Type an address and press Enter or a comma (or paste several) to
 * make chips; matching contacts are suggested while typing. A typed address and a suggested one
 * go through the same check, which refuses an invalid address and one already in To, Cc or Bcc.
 */
export function EmailChipInput({
  label,
  field,
  fields,
  onFieldsChange,
  suggestions = [],
  disabled,
}: Props) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(-1);
  const [open, setOpen] = useState(false);

  const matches = useMemo(
    () => filterSuggestions(suggestions, draft, fields),
    [suggestions, draft, fields],
  );
  const listOpen = open && matches.length > 0;
  const listId = `${uid}-list`;
  const errorId = `${uid}-error`;

  const commit = (text: string) => {
    const r = commitDraft(fields, field, text);
    if (r.fields !== fields) onFieldsChange(r.fields);
    setDraft(r.remaining);
    setError(r.error);
    setHighlight(-1);
    return r;
  };

  const pick = (email: string) => {
    const r = pickSuggestion(fields, field, email, draft);
    if (r.fields !== fields) onFieldsChange(r.fields);
    setDraft(r.remaining);
    setError(r.error);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const action = chipKeyAction(e.key, {
      draft,
      hasHighlight: listOpen && highlight >= 0,
      listOpen,
    });
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "commit":
        commit(draft);
        break;
      case "pick": {
        const picked = matches[highlight];
        if (picked) pick(picked.email);
        break;
      }
      case "removeLast":
        onFieldsChange(removeLastChip(fields, field));
        setError(null);
        break;
      case "next":
        setHighlight((h) => (h + 1) % matches.length);
        break;
      case "prev":
        setHighlight((h) => (h <= 0 ? matches.length - 1 : h - 1));
        break;
      case "close":
        setOpen(false);
        setHighlight(-1);
        break;
    }
  };

  return (
    <div className="relative">
      <label htmlFor={`${uid}-input`} className="mb-1 block text-xs font-semibold text-gray-500">
        {label}
      </label>
      <div
        className={`flex flex-wrap items-center gap-1 rounded border bg-white px-2 py-1 text-sm focus-within:border-lightBlue ${
          error ? "border-red-400" : "border-gray-300"
        }`}
        onClick={() => inputRef.current?.focus()}
      >
        {fields[field].map((email) => (
          <span
            key={email}
            data-testid={`chip-${field}`}
            className="inline-flex max-w-full items-center gap-1 rounded-full bg-blue-50 py-0.5 pl-2 pr-1 text-xs text-darkBlue"
          >
            <span className="break-all">{email}</span>
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${email} from ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onFieldsChange(removeChip(fields, field, email));
                  setError(null);
                  inputRef.current?.focus();
                }}
                className="cursor-pointer rounded-full p-0.5 text-gray-500 hover:bg-blue-100 hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </span>
        ))}
        <input
          id={`${uid}-input`}
          ref={inputRef}
          type="text"
          inputMode="email"
          autoComplete="off"
          disabled={disabled}
          value={draft}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && highlight >= 0 ? `${uid}-opt-${highlight}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          placeholder={fields[field].length === 0 ? "name@example.com" : ""}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
            setOpen(true);
            setHighlight(-1);
          }}
          onKeyDown={onKeyDown}
          onPaste={(e) => {
            const text = e.clipboardData.getData("text");
            if (/[\s,;<]/.test(text.trim())) {
              e.preventDefault();
              commit(`${draft} ${text}`);
            }
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            setOpen(false);
            if (draft.trim()) commit(draft);
          }}
          className="min-w-[8rem] flex-1 border-0 bg-transparent py-0.5 outline-none"
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}
      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-200 bg-white py-1 text-sm shadow-md"
        >
          {matches.map((c, i) => (
            <li
              key={c.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              // mousedown, not click: the input's blur would otherwise close the list first.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c.email);
              }}
              className={`cursor-pointer px-3 py-1.5 ${i === highlight ? "bg-blue-50" : "hover:bg-gray-50"}`}
            >
              <span className="font-medium">{c.name || c.email}</span>
              {c.name && <span className="ml-2 break-all text-xs text-gray-500">{c.email}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
