import { DateTime } from "luxon";
import { QuotesBookingsFilters } from "../types";

export type ScorecardTemplate =
  | "quotes-sent"
  | "quotes-signed"
  | "value-of-quotes-sent"
  | "value-of-quotes-signed"
  | "revenue";

export const SCORECARD_TEMPLATES: Record<
  ScorecardTemplate,
  { label: string; description: string }
> = {
  "quotes-sent": {
    label: "Quotes Sent",
    description:
      "Showing all events created within the selected period. The scorecard counts every event by its Created At date.",
  },
  "quotes-signed": {
    label: "Quotes Signed",
    description:
      "Showing all events with a Booked At date within the selected period. The scorecard counts rows where Booked At falls in the range.",
  },
  "value-of-quotes-sent": {
    label: "Value of Quotes Sent",
    description:
      "Showing all events created within the selected period. The scorecard sums the contract revenue of those events.",
  },
  "value-of-quotes-signed": {
    label: "Value of Quotes Signed",
    description:
      "Showing all events with a Booked At date within the selected period. The scorecard sums the contract revenue of those events.",
  },
  revenue: {
    label: "Revenue",
    description:
      "Showing all booked events whose Event Start date falls within the selected period. The scorecard sums the contract revenue of those events.",
  },
};

export function isScorecardTemplate(value: string | null): value is ScorecardTemplate {
  return value !== null && value in SCORECARD_TEMPLATES;
}

type TimeRange = "weekly" | "quarterly" | "annually";

function getPeriodDates(
  timeRange: TimeRange,
  period: "this" | "last",
  anchor?: string | null,
): { from: string; to: string } {
  const now = anchor ? DateTime.fromISO(anchor) : DateTime.local();
  const valid = now.isValid ? now : DateTime.local();

  if (timeRange === "quarterly") {
    const start =
      period === "this"
        ? valid.startOf("quarter")
        : valid.startOf("quarter").minus({ quarters: 1 });
    const end =
      period === "this"
        ? valid.startOf("quarter").plus({ quarters: 1 }).minus({ days: 1 })
        : valid.startOf("quarter").minus({ days: 1 });
    return { from: start.toFormat("yyyy-MM-dd"), to: end.toFormat("yyyy-MM-dd") };
  }
  if (timeRange === "annually") {
    const start =
      period === "this"
        ? valid.startOf("year")
        : valid.startOf("year").minus({ years: 1 });
    const end =
      period === "this"
        ? valid.startOf("year").plus({ years: 1 }).minus({ days: 1 })
        : valid.startOf("year").minus({ days: 1 });
    return { from: start.toFormat("yyyy-MM-dd"), to: end.toFormat("yyyy-MM-dd") };
  }
  // weekly
  const start =
    period === "this"
      ? valid.startOf("week")
      : valid.startOf("week").minus({ weeks: 1 });
  const end =
    period === "this"
      ? valid.startOf("week").plus({ weeks: 1 }).minus({ days: 1 })
      : valid.startOf("week").minus({ days: 1 });
  return { from: start.toFormat("yyyy-MM-dd"), to: end.toFormat("yyyy-MM-dd") };
}

/**
 * Build the QuotesBookingsFilters that correspond to a scorecard template + time range + period.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH.
 * Both the scorecard hooks and the quotes-bookings page template view use this function.
 * If you change what "Revenue" means, change it here and both pages update.
 */
export function filtersForTemplate(
  template: ScorecardTemplate,
  timeRange: TimeRange,
  period: "this" | "last" = "this",
  accountManagerUserUuid?: string | null,
  periodStart?: string | null,
): QuotesBookingsFilters {
  const { from, to } = getPeriodDates(timeRange, period, periodStart);

  // For "this" period, cap the end date at today so the Q&B page shows the same
  // running total as the scorecard (which reads at currentDay, not end-of-period).
  const today = DateTime.local().toFormat("yyyy-MM-dd");
  const effectiveTo = period === "this" && to > today ? today : to;

  const base: QuotesBookingsFilters = {
    isOpen: true,
    statuses: [],
    createdFrom: null,
    createdTo: null,
    eventFrom: null,
    eventTo: null,
    bookedFrom: null,
    bookedTo: null,
    inGoodShuffle: null,
    inQuickBooks: null,
    inbound: null,
    zoneUuids: [],
    salesOfficeUuid: null,
    accountManagerUserUuid: accountManagerUserUuid ?? null,
  };

  switch (template) {
    case "quotes-sent":
    case "value-of-quotes-sent":
      return { ...base, createdFrom: from, createdTo: effectiveTo };
    case "quotes-signed":
      return { ...base, bookedFrom: from, bookedTo: effectiveTo };
    case "value-of-quotes-signed":
      return { ...base, bookedFrom: from, bookedTo: effectiveTo };
    case "revenue":
      return { ...base, statuses: ["booked"], eventFrom: from, eventTo: effectiveTo };
  }
}

/**
 * Build a URL to the quotes-bookings page with template + time range params.
 * Optionally filter by account manager.
 */
export function buildScorecardTemplateUrl(
  template: ScorecardTemplate,
  timeRange: TimeRange,
  accountManagerUserUuid?: string | null,
  periodStart?: string | null,
): string {
  let url = `/quotes-bookings?template=${template}&timeRange=${timeRange}`;
  if (accountManagerUserUuid) {
    url += `&accountManager=${accountManagerUserUuid}`;
  }
  if (periodStart) {
    url += `&periodStart=${periodStart}`;
  }
  return url;
}
