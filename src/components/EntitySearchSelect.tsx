"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";

type EntitySearchSelectProps<T extends { id: string }> = {
  items: T[];
  /** The currently selected item (in the same shape as `items`), or null. */
  selected: T | null;
  /** Pick an existing item. */
  onSelect: (item: T) => void;
  /** Clear back to nothing selected. */
  onClear: () => void;
  /** "+ Create New ..." clicked, with whatever's currently typed. */
  onCreateNew: (query: string) => void;
  /** Pencil clicked — on a dropdown row, or on the selected-state card. */
  onEdit: (id: string) => void;
  /** Bigger-font line of a card (dropdown row or the selected-state card). */
  renderPrimary: (item: T) => ReactNode;
  /** Smaller, lighter line underneath `renderPrimary`. */
  renderSecondary: (item: T) => ReactNode;
  /** Text matched against the typed query — not necessarily what's shown. */
  getSearchText: (item: T) => string;
  /** e.g. "+ Create New Venue" / "+ Create New Contact". */
  createLabel: string;
  /** e.g. "No venues found." / "No contacts found." */
  emptyLabel: string;
  /** Placeholder shown on the persistent card when nothing is selected, e.g. "Select venue..." */
  emptyCardLabel: string;
  placeholder?: string;
};

function EntityRow<T extends { id: string }>({
  item,
  renderPrimary,
  renderSecondary,
  onSelect,
  onEdit,
}: {
  item: T;
  renderPrimary: (item: T) => ReactNode;
  renderSecondary: (item: T) => ReactNode;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
      onClick={onSelect}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-darkBlue truncate">{renderPrimary(item)}</div>
        <div className="text-xs text-gray-500 truncate">{renderSecondary(item)}</div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label="Edit"
        className="shrink-0 p-1.5 text-gray-400 hover:text-darkBlue transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * Entity-agnostic replacement for SearchableSelect: a persistent card — the
 * selected item's row (primary/secondary + edit pencil + clear), or an
 * empty-state placeholder card when nothing's picked — that's always what's
 * shown at rest. Clicking it (either state) opens a floating panel right
 * below it with a focused search box, a filtered list of the same card
 * rows, and a "+ Create New ..." row pinned at the bottom; picking a row,
 * clicking the card again, clicking outside, or Escape all close it back
 * up. Originally built for venues (see docs/specs/venue-history.md §2.3);
 * genericized so contacts (and any future entity) can share the exact same
 * behavior, including the portal outside-click fix below.
 */
export function EntitySearchSelect<T extends { id: string }>({
  items,
  selected,
  onSelect,
  onClear,
  onCreateNew,
  onEdit,
  renderPrimary,
  renderSecondary,
  getSearchText,
  createLabel,
  emptyLabel,
  emptyCardLabel,
  placeholder = "Search...",
}: EntitySearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The persistent card — used both to anchor the floating panel's position
  // and, via the outside-click check below, to know a click on the card
  // itself isn't "outside" (its own onClick handles the open/close toggle).
  const cardRef = useRef<HTMLDivElement>(null);
  // The dropdown is a createPortal into document.body — it is not a DOM
  // descendant of cardRef, so the outside-click check below needs its own
  // ref to know a click inside the (portaled) panel isn't "outside" either.
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
  // Chrome's address/contact autofill keys off far more than a matching
  // `autocomplete` value — it also reads keywords in nearby placeholder/label
  // text (this box searches by name, email and phone, so it reads as an
  // address field) and can suggest anyway. Starting the field `readOnly` and
  // stripping that on the first real focus/touch defeats it reliably: Chrome
  // checks `readOnly` at the moment focus fires, before this state update
  // lands, so it never sees an editable field to attach a suggestion to.
  const [inputReadOnly, setInputReadOnly] = useState(true);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    } else {
      setInputReadOnly(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inCard = cardRef.current?.contains(target) ?? false;
      const inDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!inCard && !inDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [open]);

  const toggleOpen = () => {
    setOpen((prev) => {
      if (!prev) setQuery("");
      return !prev;
    });
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((item) => getSearchText(item).toLowerCase().includes(q))
    : items;

  return (
    <div className="relative w-full">
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleOpen();
          }
        }}
        className={cn(
          "flex items-center justify-between gap-2 w-full border rounded-md px-3 py-2 bg-white cursor-pointer hover:border-gray-300",
          open && "border-darkBlue",
        )}
      >
        {selected ? (
          <>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-darkBlue truncate">
                {renderPrimary(selected)}
              </div>
              <div className="text-xs text-gray-500 truncate">{renderSecondary(selected)}</div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(selected.id);
                }}
                aria-label="Edit"
                className="p-1.5 text-gray-400 hover:text-darkBlue transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                aria-label="Clear"
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : (
          <span className="text-sm text-gray-400">{emptyCardLabel}</span>
        )}
      </div>

      {open &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="absolute bg-white border shadow-lg rounded z-[9999] overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: pos.width, position: "absolute" }}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setOpen(false);
                  inputRef.current?.blur();
                }
              }}
              placeholder={placeholder}
              className="w-full p-2 border-b text-sm focus:outline-none"
              // Belt-and-suspenders against Chrome's address/contact autofill:
              // "new-password" is the one autoComplete hint it reliably never
              // fills; readOnly (stripped on first real focus/touch, below) is
              // the part that actually stops the suggestion popover, since
              // Chrome also keys off nearby text and not just this attribute.
              autoComplete="new-password"
              name="entity-search"
              data-1p-ignore
              data-lpignore="true"
              readOnly={inputReadOnly}
              onFocus={() => setInputReadOnly(false)}
              onTouchStart={() => setInputReadOnly(false)}
            />
            <div className="max-h-72 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400">{emptyLabel}</p>
              )}
              {filtered.map((item) => (
                <EntityRow
                  key={item.id}
                  item={item}
                  renderPrimary={renderPrimary}
                  renderSecondary={renderSecondary}
                  onSelect={() => {
                    onSelect(item);
                    setOpen(false);
                  }}
                  onEdit={() => {
                    setOpen(false);
                    onEdit(item.id);
                  }}
                />
              ))}
              <div
                className="px-3 py-2 text-sm font-medium text-darkBlue hover:bg-gray-50 cursor-pointer border-t"
                onClick={() => {
                  setOpen(false);
                  onCreateNew(query);
                }}
              >
                {createLabel}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
