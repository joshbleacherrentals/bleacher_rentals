"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { validateAllowedEmail } from "@/features/devEmailAllowlist/logic/validateAllowedEmail";
import {
  addRecipient,
  namesByAddress,
  recipientLabel,
  removeRecipient,
  suggestContacts,
  type DirectoryContact,
} from "../logic/recipientList";

/**
 * One list of the people a reply goes to (To, Cc or Bcc), as pills that wrap onto more lines when
 * they run out of width, with a text box after the last one to add more. Each pill shows a
 * contact's name and address (just the address for anyone who is not a contact) and an X to remove
 * it. Typing suggests contacts, by address or name; Enter, Tab or a click adds the highlighted one,
 * and Enter, a comma or a semicolon adds what was typed when it is an email address. Backspace in
 * the empty box removes the last pill.
 */
export function ReplyRecipients({
  label,
  directory,
  recipients,
  onChange,
}: {
  /** What the text box is for ("Add a Cc recipient"): its accessible name and its empty hint. */
  label: string;
  /** The contacts with an email address: who is suggested, and whose names the pills show. */
  directory: DirectoryContact[];
  recipients: string[];
  onChange: (next: string[]) => void;
}) {
  const names = useMemo(() => namesByAddress(directory), [directory]);

  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);
  const [focused, setFocused] = useState(false);
  // Escape hides the suggestions until the text changes again.
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  const suggestions = useMemo(
    () => suggestContacts(directory, query, recipients),
    [directory, query, recipients],
  );
  const showSuggestions = focused && suggestions.length > 0 && hiddenFor !== query;
  const active = Math.min(highlighted, suggestions.length - 1);

  const add = (address: string) => {
    onChange(addRecipient(recipients, address));
    setQuery("");
    setError(null);
    setHighlighted(0);
  };

  const addTyped = () => {
    const text = query.trim();
    if (!text) return;
    const result = validateAllowedEmail(
      text,
      recipients.map((email) => ({ id: email, email })),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    add(result.email);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showSuggestions) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted((active + step + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const picked = showSuggestions ? suggestions[active] : undefined;
      if (picked) add(picked.email);
      else addTyped();
    } else if (event.key === "Tab" && !event.shiftKey && showSuggestions) {
      // Tab takes the highlighted suggestion like Enter; with none showing it moves on as usual.
      event.preventDefault();
      add(suggestions[active].email);
    } else if (event.key === "," || event.key === ";") {
      event.preventDefault();
      addTyped();
    } else if (event.key === "Backspace" && query === "" && recipients.length > 0) {
      onChange(recipients.slice(0, -1));
    } else if (event.key === "Escape" && showSuggestions) {
      setHiddenFor(query);
    }
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1.5" onClick={() => input.current?.focus()}>
        {recipients.map((address) => (
          <span
            key={address}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-gray-300 py-0.5 pl-3 pr-1 text-sm text-gray-800"
          >
            <span className="truncate">{recipientLabel(address, names)}</span>
            <button
              type="button"
              aria-label={`Remove ${address}`}
              onClick={() => onChange(removeRecipient(recipients, address))}
              className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setError(null);
            setHighlighted(0);
            setHiddenFor(null);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          role="combobox"
          aria-expanded={showSuggestions}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          placeholder={recipients.length === 0 ? label : ""}
          className="min-w-40 flex-1 bg-transparent py-0.5 text-sm text-gray-900 outline-none placeholder:text-gray-400"
        />
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      )}

      {showSuggestions && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 top-full z-20 mt-1 max-h-52 w-full max-w-md overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-md"
        >
          {suggestions.map((contact, i) => (
            <li
              key={contact.id}
              role="option"
              aria-selected={i === active}
              // Mouse down must not take focus from the box, or the list would close before the click.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add(contact.email)}
              onMouseEnter={() => setHighlighted(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === active ? "bg-gray-100" : ""}`}
            >
              {contact.name && <div className="font-medium text-gray-900">{contact.name}</div>}
              <div className={contact.name ? "text-xs text-gray-500" : "text-gray-900"}>
                {contact.email}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
