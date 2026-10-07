"use client";

import type { ReactNode } from "react";
import { QuotesBookingsFilters } from "../types";
import { StatusMultiSelect } from "./filters/StatusMultiSelect";
import { DateRangeInput } from "./filters/DateRangeInput";
import { AccountManagerMultiSelect } from "./filters/AccountManagerMultiSelect";
import { TimezoneSelect } from "./filters/TimezoneSelect";
import { InGoodShuffleSelect } from "./filters/InGoodShuffleSelect";
import { InQuickBooksSelect } from "./filters/InQuickBooksSelect";
import { SalesOfficeSelect } from "./filters/SalesOfficeSelect";

type FilterPanelProps = {
  filters: QuotesBookingsFilters;
  /** Off on the AR tabs, which only ever hold booked events (see `tabUsesStatusFilter`). */
  showStatus?: boolean;
  onStatusesChange: (values: string[]) => void;
  onCreatedRangeChange: (from: string | null, to: string | null) => void;
  onEventRangeChange: (from: string | null, to: string | null) => void;
  onBookedRangeChange: (from: string | null, to: string | null) => void;
  onAccountManagerChange: (uuid: string | null) => void;
  onInGoodShuffleChange: (value: boolean | null) => void;
  onInQuickBooksChange: (value: boolean | null) => void;
  onSalesOfficeChange: (uuid: string | null) => void;
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-700 mb-1">{label}</div>
      {children}
    </div>
  );
}

/** The filter controls only — FilterSidebar supplies the frame, scrolling and Clear button. */
export function FilterPanel({
  filters,
  showStatus = true,
  onStatusesChange,
  onCreatedRangeChange,
  onEventRangeChange,
  onBookedRangeChange,
  onAccountManagerChange,
  onInGoodShuffleChange,
  onInQuickBooksChange,
  onSalesOfficeChange,
}: FilterPanelProps) {
  return (
    <div className="space-y-3">
      {showStatus && (
        <Field label="Status">
          <StatusMultiSelect values={filters.statuses} onChange={onStatusesChange} />
        </Field>
      )}

      <Field label="Account Manager">
        <AccountManagerMultiSelect
          selectedUserUuid={filters.accountManagerUserUuid}
          onChange={onAccountManagerChange}
        />
      </Field>

      <Field label="Sales Office">
        <SalesOfficeSelect value={filters.salesOfficeUuid} onChange={onSalesOfficeChange} />
      </Field>

      <Field label="Created">
        <DateRangeInput
          label="Created"
          from={filters.createdFrom}
          to={filters.createdTo}
          onChange={onCreatedRangeChange}
        />
      </Field>

      <Field label="Event Start">
        <DateRangeInput
          label="Event"
          from={filters.eventFrom}
          to={filters.eventTo}
          onChange={onEventRangeChange}
        />
      </Field>

      <Field label="Booked">
        <DateRangeInput
          label="Booked"
          from={filters.bookedFrom}
          to={filters.bookedTo}
          onChange={onBookedRangeChange}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="GoodShuffle">
          <InGoodShuffleSelect value={filters.inGoodShuffle} onChange={onInGoodShuffleChange} />
        </Field>
        <Field label="QuickBooks">
          <InQuickBooksSelect value={filters.inQuickBooks} onChange={onInQuickBooksChange} />
        </Field>
      </div>

      <Field label="Timezone">
        <TimezoneSelect />
      </Field>
    </div>
  );
}
