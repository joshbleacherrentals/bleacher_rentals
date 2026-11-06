"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCollectionsData } from "../hooks/useCollectionsData";
import {
  nextSortState,
  parseCollectionsListState,
  type CollectionsListState,
  type CollectionsSortKey,
} from "../utils/collectionsListState";
import { filterCollectionsRows, sortCollectionsRows } from "../utils/collectionsSort";
import { withCollectionsListState } from "../utils/invoiceUrl";
import { CollectionsTable } from "./CollectionsTable";

/**
 * The body of the Collections tab: Show Not Due Yet and the table. The state of the list lives in
 * the URL (`csort`, `cdir`, `cnotdue`), so a reload and the invoice page's Back to tasks keep it.
 * docs/specs/accountant-collections-09-design.md §3.
 */
export function CollectionsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => parseCollectionsListState(searchParams), [searchParams]);

  const { rows, isLoading, error, today } = useCollectionsData();
  const listed = useMemo(
    () => sortCollectionsRows(filterCollectionsRows(rows, state, today), state),
    [rows, state, today],
  );

  const update = (next: CollectionsListState) => {
    router.replace(
      `${pathname}?${withCollectionsListState(new URLSearchParams(searchParams.toString()), next)}`,
      {
        scroll: false,
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={state.showNotDue}
          onClick={() => update({ ...state, showNotDue: !state.showNotDue })}
          className="flex cursor-pointer select-none items-center gap-2 text-sm text-gray-600"
        >
          <span>Show Not Due Yet</span>
          <span
            className={`relative inline-flex h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-200 ${
              state.showNotDue ? "bg-darkBlue" : "bg-gray-300"
            }`}
          >
            <span
              className={`pointer-events-none mt-[2px] inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                state.showNotDue ? "translate-x-[20px]" : "translate-x-[2px]"
              }`}
            />
          </span>
        </button>
      </div>
      <CollectionsTable
        rows={listed}
        state={state}
        today={today}
        isLoading={isLoading}
        error={error}
        onSort={(key: CollectionsSortKey) => update(nextSortState(state, key))}
      />
    </div>
  );
}
