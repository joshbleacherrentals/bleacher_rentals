"use client";

import { Search } from "lucide-react";

/** R6: the pause between the last key and the write into the URL. */
export const SEARCH_WRITE_DELAY_MS = 300;

/**
 * Calls `fn` with the last text after `delayMs` without a new one. `cancel` drops a pending call
 * (used when the list unmounts). Kept apart from React so a test can drive it with fake timers.
 */
export function createDebouncer(fn: (text: string) => void, delayMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule(text: string) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        fn(text);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

type Props = {
  value: string;
  onChange: (text: string) => void;
};

/**
 * The search bar above the drivers table: a magnifier and a text box, the look of the page's own
 * search box. It only holds the text; the list filters with it at once and writes it into the URL
 * after a pause. docs/specs/accountant-audit-05-drivers-table.md §2.3 (R6).
 */
export function AuditSearchBar({ value, onChange }: Props) {
  return (
    <div className="relative min-w-[240px] flex-1">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
      />
      <input
        type="text"
        aria-label="Search drivers"
        data-testid="audit-search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search by driver name..."
        className="h-[40px] w-full rounded border pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue"
      />
    </div>
  );
}
