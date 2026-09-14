"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import type { VenueFull, VenuePickerValue } from "@/features/venues/types";

export function venueAddressLine(address: {
  street: string;
  city: string;
  stateProvince: string;
  zipPostal: string;
}): string {
  return [address.street, address.city, address.stateProvince, address.zipPostal]
    .filter(Boolean)
    .join(", ");
}

type VenueSearchSelectProps = {
  value: VenuePickerValue;
  venues: VenueFull[];
  /** Pick an existing venue. */
  onSelect: (venue: VenueFull) => void;
  /** Clear back to nothing selected. */
  onClear: () => void;
  /** "+ Create New Venue" clicked, with whatever's currently typed. */
  onCreateNew: (query: string) => void;
  /** Pencil clicked — on a dropdown row, or on the selected-state card. */
  onEditVenue: (venueId: string) => void;
  placeholder?: string;
};

function VenueRow({
  venue,
  onSelect,
  onEdit,
}: {
  venue: VenueFull;
  onSelect: () => void;
  onEdit: () => void;
}) {
  return (
    <div
      className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
      onClick={onSelect}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-darkBlue truncate">{venue.name}</div>
        <div className="text-xs text-gray-500 truncate">{venueAddressLine(venue.address)}</div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        aria-label={`Edit ${venue.name}`}
        className="shrink-0 p-1.5 text-gray-400 hover:text-darkBlue transition-colors"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/**
 * Venue-specific replacement for SearchableSelect: at rest looks like a
 * plain text field, not a dropdown-styled button — typing filters a list
 * of Venue Card rows (name + one-line address + an edit pencil each,
 * independent of selecting that row), with "+ Create New Venue" pinned at
 * the bottom. Once something's picked, this same row layout becomes the
 * field's own display (in place of the search box) — click it to search
 * again, click its pencil to edit, click its X to clear.
 */
export function VenueSearchSelect({
  value,
  venues,
  onSelect,
  onClear,
  onCreateNew,
  onEditVenue,
  placeholder = "Search by name or address...",
}: VenueSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // The dropdown is a createPortal into document.body — it is not a DOM
  // descendant of containerRef, so the outside-click check below needs its
  // own ref to know a click inside the (portaled) dropdown isn't "outside".
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });

  const selectedVenueId = value.mode === "venue" ? value.venueId : null;

  // A save (create, or edit-from-dropdown which also selects — see
  // VenuePicker) lands here as `value` changing to a venue. Drop back into
  // display mode automatically rather than leaving the dropdown open over
  // a selection that already happened.
  useEffect(() => {
    if (selectedVenueId) setOpen(false);
  }, [selectedVenueId]);

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
  if (!open && value.mode === "venue") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={openSearch}
        onKeyDown={(e) => e.key === "Enter" && openSearch()}
        className="flex items-center justify-between gap-2 w-full border rounded-md px-3 py-2 bg-white cursor-pointer hover:border-gray-300"
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-darkBlue truncate">{value.name}</div>
          <div className="text-xs text-gray-500 truncate">{venueAddressLine(value.address)}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditVenue(value.venueId);
            }}
            aria-label="Edit venue"
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
            aria-label="Clear venue"
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
    ? venues.filter((v) => `${v.name} ${venueAddressLine(v.address)}`.toLowerCase().includes(q))
    : venues;

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
              <p className="px-3 py-2 text-sm text-gray-400">No venues found.</p>
            )}
            {filtered.map((v) => (
              <VenueRow
                key={v.id}
                venue={v}
                onSelect={() => {
                  onSelect(v);
                  setOpen(false);
                }}
                onEdit={() => {
                  setOpen(false);
                  onEditVenue(v.id);
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
              + Create New Venue
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
