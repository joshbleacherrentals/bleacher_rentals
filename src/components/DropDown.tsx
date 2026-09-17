// components/Dropdown.tsx
"use client";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { panelPosition, PANEL_MAX_HEIGHT, type Placement } from "./entitySearch/panelPosition";
import { estimateListHeight } from "./dropdown/estimateListHeight";

type DropdownOption<T> = {
  label: string;
  value: T;
};

type DropdownProps<T> = {
  options: DropdownOption<T>[];
  onSelect: (value: T) => void;
  placeholder?: string;
  selected?: T;
  className?: string;
  formatSelectedLabel?: (label: string) => string;
  disabled?: boolean;
};

export function Dropdown<T>({
  options,
  onSelect,
  placeholder = "Select an option",
  selected,
  className = "",
  formatSelectedLabel,
  disabled = false,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placement: Placement;
  }>({ top: 0, left: 0, width: 0, maxHeight: PANEL_MAX_HEIGHT, placement: "below" });
  // The list's full height, scrolled-off part included. 0 until it has rendered once.
  const [measuredHeight, setMeasuredHeight] = useState(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The list is portaled to <body> at an absolute position computed once, so any
  // scroll underneath it — including the work tracker modal's own scroll —
  // leaves it hanging over the wrong control. Close instead of chasing.
  useEffect(() => {
    if (!isOpen) return;
    const close = (event: Event) => {
      if (listRef.current && listRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
    };
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [isOpen]);

  // Opens below the button, or above it when there is not enough room below (the same rule the
  // venue and contact pickers use), and caps the list to that room so its last options stay
  // reachable by scrolling instead of running off the screen.
  useLayoutEffect(() => {
    if (!isOpen || !ref.current) return;
    const { placement, ...pos } = panelPosition(
      ref.current.getBoundingClientRect(),
      null,
      { x: window.scrollX, y: window.scrollY },
      {
        contentHeight: estimateListHeight(options.length, measuredHeight),
        viewportHeight: window.innerHeight,
      },
    );
    setDropdownPos({ ...pos, placement });
  }, [isOpen, options.length, measuredHeight]);

  // Measured once the list has its real width, still before paint. Measuring as it mounts read it
  // at the previous width — 0 on the first open — where every label wraps word by word, so the
  // list looked several times taller than it is and an upward list floated far above its button.
  // scrollHeight ignores the height cap and the open animation's scale.
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!isOpen || !node || dropdownPos.width === 0) return;
    const height = node.scrollHeight + (node.offsetHeight - node.clientHeight);
    if (height > 0 && height !== measuredHeight) setMeasuredHeight(height);
  }, [isOpen, dropdownPos.width, options, measuredHeight]);

  // The list slides out of the button, whichever side of it that is.
  const slideFrom = dropdownPos.placement === "above" ? 5 : -5;

  const rawLabel = options.find((option) => option.value === selected)?.label;
  const selectedLabel = rawLabel
    ? formatSelectedLabel
      ? formatSelectedLabel(rawLabel)
      : rawLabel
    : placeholder;

  return (
    <>
      <div ref={ref} className={`relative w-full ${className}`}>
        <button
          ref={buttonRef}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          disabled={disabled}
          className={`w-full h-[40px] min-w-0 flex items-center text-sm font-medium justify-between border rounded px-2 py-2 text-left transition-all disabled:opacity-100 ${
            disabled
              ? "bg-gray-50 text-gray-700 cursor-default"
              : "bg-white text-muted-foreground cursor-pointer hover:shadow"
          }`}
        >
          {/* truncate + title: long option labels used to widen the button past
              its column and spill over the neighbouring one. */}
          <span className="truncate" title={selectedLabel}>
            {selectedLabel}
          </span>
          {!disabled && (
            <ChevronDown
              size={16}
              className={`ml-2 text-gray-500 transition-transform duration-200 ${
                isOpen ? "rotate-180" : "rotate-0"
              }`}
            />
          )}
        </button>
      </div>

      {typeof window !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && !disabled && (
              <motion.ul
                ref={listRef}
                initial={{ opacity: 0, scale: 0.95, y: slideFrom }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: slideFrom }}
                transition={{ duration: 0.15 }}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute z-[9999] bg-white border border-gray-200 rounded shadow-lg overflow-y-auto"
                style={{
                  position: "absolute",
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                  maxHeight: dropdownPos.maxHeight,
                  transformOrigin: dropdownPos.placement === "above" ? "bottom" : "top",
                  pointerEvents: "auto",
                }}
              >
                {options.map((option) => (
                  <li
                    key={String(option.value)}
                    onPointerDown={() => {
                      onSelect(option.value);
                      setIsOpen(false);
                    }}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                  >
                    {option.label}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>,
          document.body, // 👈 Renders the dropdown directly into the body
        )}
    </>
  );
}
