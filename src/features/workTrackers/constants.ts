import { Truck, Wrench, Sparkles, HelpCircle, type LucideIcon } from "lucide-react";
import type { Database } from "../../../database.types";

type WorkTrackerStatus = Database["public"]["Enums"]["worktracker_status"];

export const WORKTRACKER_STATUS_COLORS: Record<
  WorkTrackerStatus,
  { bg: string; border: string; text: string }
> = {
  draft: { bg: "bg-yellow-500/10", border: "border-yellow-600", text: "text-yellow-700" },
  released: { bg: "bg-blue-500/10", border: "border-blue-600", text: "text-blue-700" },
  accepted: { bg: "bg-green-500/10", border: "border-green-600", text: "text-green-700" },
  dest_pickup: { bg: "bg-emerald-500/10", border: "border-emerald-600", text: "text-emerald-700" },
  pickup_inspection: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-600",
    text: "text-emerald-700",
  },
  dest_dropoff: { bg: "bg-emerald-500/10", border: "border-emerald-600", text: "text-emerald-700" },
  dropoff_inspection: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-600",
    text: "text-emerald-700",
  },
  completed: { bg: "bg-green-800/10", border: "border-green-800/75", text: "text-green-800/75" },
  cancelled: { bg: "bg-red-500/10", border: "border-red-600", text: "text-red-700" },
  // The two driver withdrawals. Both read as red — the office has to re-cover
  // the work either way — but they are not the same red as `cancelled`, which
  // is the office's own decision and needs no reaction.
  declined: { bg: "bg-rose-500/10", border: "border-rose-600", text: "text-rose-700" },
  abandoned: { bg: "bg-red-700/10", border: "border-red-700", text: "text-red-800" },
};

export type WorkTrackerTypeStyle = {
  icon: LucideIcon;
  bg: string;
  border: string;
  text: string;
};

/**
 * Icon + color for each of the 3 canonical work tracker types, keyed by the
 * stable `code` column (see workTrackerTypeDisplay.ts) rather than the
 * database's freely-editable display_name — renaming a type's label never
 * silently falls back to the gray "unknown" style.
 */
export const WORK_TRACKER_TYPE_STYLES: Record<string, WorkTrackerTypeStyle> = {
  trip: { icon: Truck, bg: "bg-blue-500/10", border: "border-blue-600", text: "text-blue-700" },
  repair_maintenance: {
    icon: Wrench,
    bg: "bg-amber-500/10",
    border: "border-amber-600",
    text: "text-amber-700",
  },
  site_visit_cleaning_other: {
    icon: Sparkles,
    bg: "bg-purple-500/10",
    border: "border-purple-600",
    text: "text-purple-700",
  },
};

/** Used for a legacy type with no code (see getSelectableWorkTrackerTypes). */
export const WORK_TRACKER_TYPE_STYLE_FALLBACK: WorkTrackerTypeStyle = {
  icon: HelpCircle,
  bg: "bg-gray-500/10",
  border: "border-gray-400",
  text: "text-gray-600",
};
