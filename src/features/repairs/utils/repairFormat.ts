import { formatMoney } from "@/features/quotesAndBookings/utils/formatMoney";
import type { RepairCurrency, RepairSeverity, ReportedReport } from "./repairRows";

/**
 * How a repair's values are written in the Repairs table: money, days, the Reported cell and the
 * colours of the status and severity pills. Pure, so it is tested without React.
 * docs/specs/repairs-04-table.md §2.3, §2.5 and §3 (the signatures here are locked by that spec).
 */

const DASH = "—";

/** `$1,234.56` or `C$1,234.56`; no amount is a dash and zero is `$0.00`. */
export function formatRepairMoney(cents: number | null, currency: RepairCurrency): string {
  return cents === null ? DASH : formatMoney(cents, currency);
}

/** A stored day (`YYYY-MM-DD`) as it is (D44); an empty one is a dash. */
export function formatRepairDay(day: string | null): string {
  return day ? day : DASH;
}

export type ReportedCell = { day: string; more: string | null };

/**
 * The Reported cell: the day of the first report and `+N` for the others, where N is the number of
 * reports minus one, not the number of days (D38). Null is a dash. The list is already earliest
 * first (spec 03).
 */
export function reportedCell(reported: readonly ReportedReport[]): ReportedCell | null {
  if (reported.length === 0) return null;
  return {
    day: reported[0].day,
    more: reported.length > 1 ? `+${reported.length - 1}` : null,
  };
}

export type PillStyle = { label: string; className: string };

// Labels and colours are drawn on the canvas (docs/design/repairs/Main.dc.html). Tailwind finds
// these class names because they are written out in full.
const STATUS_PILLS: Record<string, PillStyle> = {
  inbound: { label: "Inbound", className: "bg-[#dce9f7] text-[#1a5892]" },
  triaged: { label: "Triaged", className: "bg-[#ece8fa] text-[#563b9c]" },
  waiting_repair: { label: "Waiting repair", className: "bg-[#fbf0da] text-[#7d5a1c]" },
  in_repair: { label: "In repair", className: "bg-[#fde6d2] text-[#93440d]" },
  confirm_repair: { label: "Confirm repair", className: "bg-[#d6eeee] text-[#1b6464]" },
  completed: { label: "Completed", className: "bg-[#dcede2] text-[#2f6b4c]" },
};

const UNKNOWN_STATUS_CLASS = "bg-[#f3f4f6] text-[#4b5563]";

/** A status the code does not know shows its own stored word on grey, so it is not hidden. */
export function statusPill(status: string): PillStyle {
  return Object.hasOwn(STATUS_PILLS, status)
    ? STATUS_PILLS[status]
    : { label: status, className: UNKNOWN_STATUS_CLASS };
}

const SEVERITY_PILLS: Record<RepairSeverity, PillStyle> = {
  major: { label: "Major", className: "bg-[#fbe7e5] text-[#a8403a]" },
  minor: { label: "Minor", className: "bg-[#fbf0da] text-[#7d5a1c]" },
  routine: { label: "Routine", className: "bg-[#eef1f6] text-[#4f6178]" },
};

export function severityPill(severity: RepairSeverity): PillStyle {
  return SEVERITY_PILLS[severity];
}
