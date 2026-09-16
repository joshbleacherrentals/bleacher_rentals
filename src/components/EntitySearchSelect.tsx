"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { panelPosition, PANEL_MAX_HEIGHT } from "./entitySearch/panelPosition";
import { searchEntities } from "./entitySearch/searchEntities";

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
  /**
   * Shown in the persistent card, in place of `emptyCardLabel`, when
   * `selected` is null but this is non-blank — e.g. a legacy value that
   * predates linking to a real item, or one that's since been deleted.
   * Rendered without the edit pencil (there's nothing resolved to edit),
   * but Clear still works.
   */
  fallbackLabel?: string | null;
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
 * selected item's row (primary/secondary + edit pencil + clear), a
 * `fallbackLabel` card (clear, no pencil) when there's a stored value that
 * doesn't resolve to a live item, or an empty-state placeholder card when
 * nothing's picked — that's always what's shown at rest. Clicking it (any
 * state) opens a floating panel right
 * below it with a focused search box, a "+ Create New ..." row pinned at
 * the top, and a page of matching card rows below it; picking a row,
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
  fallbackLabel,
  placeholder = "Search...",
}: EntitySearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // The persistent card — used both to anchor the floating panel's position
  // and, via the outside-click check below, to know a click on the card
  // itself isn't "outside" (its own onClick handles the open/close toggle).
  const cardRef = useRef<HTMLDivElement>(null);
  // The dropdown is a createPortal (see portalTarget below) — it is not a DOM
  // descendant of cardRef, so the outside-click check below needs its own
  // ref to know a click inside the (portaled) panel isn't "outside" either.
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxHeight: PANEL_MAX_HEIGHT });
  // The scrollable list inside the panel — measured together with the panel to work out how tall
  // the panel would be with nothing constraining it.
  const listRef = useRef<HTMLDivElement>(null);
  // That unconstrained height. Kept across closes: the previous value is a good estimate for the
  // next open, so its very first frame already sits on the right side of the card.
  const [contentHeight, setContentHeight] = useState(0);
  // Where the floating panel is portaled to. document.body is right for a picker on an ordinary
  // page, but inside a Radix dialog it is not: Radix puts `pointer-events: none` on the body
  // while a dialog is open and closes the dialog on a pointer-down outside its content, so a
  // panel parked on the body renders unclickable and, when it does take a click, shuts the
  // dialog. Portaling into the dialog's own content element keeps the panel inside it on both
  // counts — this is what made Venue unusable in New/Edit Contact.
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
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

  const updatePosition = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;

    const dialog = card.closest<HTMLElement>('[data-slot="dialog-content"]');

    setPortalTarget(dialog ?? document.body);
    setPos(
      panelPosition(
        card.getBoundingClientRect(),
        dialog
          ? {
              rect: dialog.getBoundingClientRect(),
              scrollTop: dialog.scrollTop,
              scrollLeft: dialog.scrollLeft,
            }
          : null,
        { x: window.scrollX, y: window.scrollY },
        { contentHeight, viewportHeight: window.innerHeight },
      ),
    );
  }, [contentHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  /**
   * Closes the panel when anything moves the card out from under it.
   *
   * The panel is portaled out of the card's own subtree, so scrolling a container between them —
   * a form section, say, rather than the page — slides the card away and leaves the panel behind.
   * `capture` is what picks those up: scroll does not bubble. Scrolling the panel's own list is
   * not that, and is ignored.
   */
  useEffect(() => {
    if (!open) return;

    const closeOnScroll = (e: Event) => {
      const target = e.target as Node | null;
      if (target && dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    const closeOnResize = () => setOpen(false);

    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, [open]);

  /**
   * How tall the panel would be if `maxHeight` were not capping it: what is on screen, with the
   * list's visible height swapped for its full scroll height. Measuring the rendered height
   * instead would be circular — the cap would make the panel look like it fits wherever it was
   * put, and it would never flip.
   */
  const measureContent = useCallback(() => {
    const panel = dropdownRef.current;
    if (!panel) return;
    const list = listRef.current;
    const height = list
      ? panel.offsetHeight - list.clientHeight + list.scrollHeight
      : panel.offsetHeight;
    if (height > 0) setContentHeight(height);
  }, []);

  /**
   * Measures the moment the panel lands in the DOM.
   *
   * A layout effect is too early for the first open: the panel only renders once `portalTarget`
   * is set, which is itself a state update from the effect above, so on the first pass there is
   * no node to measure — which is why the first open used to ignore a flip and every open after
   * it got one. A callback ref runs when the node actually mounts, on every open. React attaches
   * children's refs before the parent's, so the list is already there.
   */
  const attachPanel = useCallback(
    (node: HTMLDivElement | null) => {
      dropdownRef.current = node;
      if (node) measureContent();
    },
    [measureContent],
  );

  // The content also shrinks as a query shortens the list, and the node stays mounted through
  // that, so re-measure on its own.
  useLayoutEffect(() => {
    if (!open) return;
    measureContent();
  }, [open, query, items, measureContent]);

  const toggleOpen = () => {
    setOpen((prev) => {
      if (!prev) setQuery("");
      return !prev;
    });
  };

  const { shown, matched, hidden } = searchEntities(items, query, getSearchText);

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
                  // stopPropagation keeps the card's own toggle from firing, so the panel has to
                  // be closed here — an edit dialog opening over a panel left standing was a bug.
                  e.stopPropagation();
                  setOpen(false);
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
                  setOpen(false);
                  onClear();
                }}
                aria-label="Clear"
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </>
        ) : fallbackLabel ? (
          <>
            <span className="text-sm font-medium text-gray-600 italic truncate">
              {fallbackLabel}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onClear();
              }}
              aria-label="Clear"
              className="shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <span className="text-sm text-gray-400">{emptyCardLabel}</span>
        )}
      </div>

      {open &&
        portalTarget &&
        createPortal(
          <div
            ref={attachPanel}
            className="absolute bg-white border shadow-lg rounded z-[9999] overflow-hidden flex flex-col"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: pos.maxHeight,
              position: "absolute",
            }}
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
              className="w-full shrink-0 p-2 border-b text-sm focus:outline-none"
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
            {/* Pinned, not the last row of the list: with hundreds of items on file nobody
                scrolls to the bottom to find it. */}
            <div
              className="shrink-0 px-3 py-2 text-sm font-medium text-darkBlue hover:bg-gray-50 cursor-pointer border-b"
              onClick={() => {
                setOpen(false);
                onCreateNew(query);
              }}
            >
              {createLabel}
            </div>
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto">
              {matched === 0 && <p className="px-3 py-2 text-sm text-gray-400">{emptyLabel}</p>}
              {shown.map((item) => (
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
              {hidden > 0 && (
                <p className="px-3 py-2 text-xs text-gray-400 border-t bg-gray-50/60">
                  Showing {shown.length} of {matched}. Keep typing to narrow it down.
                </p>
              )}
            </div>
          </div>,
          portalTarget,
        )}
    </div>
  );
}
