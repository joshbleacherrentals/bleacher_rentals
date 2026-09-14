"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";

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
 * Entity-agnostic replacement for SearchableSelect: at rest looks like a
 * plain text field, not a dropdown-styled button — typing filters a list of
 * card rows (a bigger-font primary line + a smaller lighter secondary line +
 * an edit pencil each, independent of selecting that row), with a
 * "+ Create New ..." row pinned at the bottom. Once something's picked, this
 * same row layout becomes the field's own display (in place of the search
 * box) — click it to search again, click its pencil to edit, click its X to
 * clear. Originally built for venues (see docs/specs/venue-history.md §2.3);
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
  placeholder = "Search...",
}: EntitySearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // The dropdown is a createPortal into document.body — it is not a DOM
  // descendant of containerRef, so the outside-click check below needs its
  // own ref to know a click inside the (portaled) dropdown isn't "outside".
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selectedId = selected?.id ?? null;

  // A save (create, or edit-from-dropdown which also selects — see
  // VenuePicker/ContactPicker) lands here as `selected` changing. Drop back
  // into display mode automatically rather than leaving the dropdown open
  // over a selection that already happened.
  useEffect(() => {
    if (selectedId) setOpen(false);
  }, [selectedId]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const inContainer = containerRef.current?.contains(target) ?? false;
      const inDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!inContainer && !inDropdown) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [open]);

  const openSearch = () => {
    setQuery("");
    setOpen(true);
  };

  // Selected, dropdown closed — the card is the whole field.
  if (!open && selected) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={openSearch}
        onKeyDown={(e) => e.key === "Enter" && openSearch()}
        className="flex items-center justify-between gap-2 w-full border rounded-md px-3 py-2 bg-white cursor-pointer hover:border-gray-300"
      >
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
      </div>
    );
  }

  // Nothing selected, or actively searching — plain text field.
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((item) => getSearchText(item).toLowerCase().includes(q))
    : items;

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder={placeholder}
        className="w-full p-2 border rounded text-sm"
      />
      {open &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            className="absolute bg-white border shadow-lg rounded z-[9999] max-h-72 overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: pos.width, position: "absolute" }}
          >
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
          </div>,
          document.body,
        )}
    </div>
  );
}
