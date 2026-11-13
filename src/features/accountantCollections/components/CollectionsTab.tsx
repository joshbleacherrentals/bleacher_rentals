"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRegisterCsvExport } from "@/components/csvExport/CsvExport";
import { useCollectionsData } from "../hooks/useCollectionsData";
import {
  nextSortState,
  parseCollectionsListState,
  type CollectionsListState,
  type CollectionsSortKey,
} from "../utils/collectionsListState";
import { buildCollectionsCsv, isCollectionsExportDisabled } from "../utils/collectionsCsv";
import { filterCollectionsRows, sortCollectionsRows } from "../utils/collectionsSort";
import { withCollectionsListState } from "../utils/invoiceUrl";
import { AmountTypeButton } from "./AmountTypeButton";
import { CollectionsTable } from "./CollectionsTable";

/**
 * The body of the Collections tab: the Collections / Deposits / All switch, Show Not Due Yet and the
 * table. The state of the list lives in the URL (`csort`, `cdir`, `cnotdue`, `type`), so a reload and
 * the invoice page's Back to tasks keep it.
 * docs/specs/accountant-collections-09-design.md §3 and accountant-collections-23-amount-type-switch.md §3.
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

  // What Export to CSV in the page header downloads while this tab is open: the list as shown.
  const getCsv = useCallback(() => buildCollectionsCsv(listed, today), [listed, today]);
  useRegisterCsvExport(
    "accountant-collections",
    getCsv,
    isCollectionsExportDisabled(isLoading, error, listed.length),
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
      <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
        <AmountTypeButton type={state.type} onChange={(type) => update({ ...state, type })} />
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
