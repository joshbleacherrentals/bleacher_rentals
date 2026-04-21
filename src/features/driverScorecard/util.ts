import { DateTime } from "luxon";
import { TimeRange } from "./types";

export function getTimeRangeDates(
  range: TimeRange,
  period: "this" | "last",
): { startDate: string; endDate: string } {
  const now = DateTime.local();

  if (range === "weekly") {
    const weekStart =
      period === "this" ? now.startOf("week") : now.startOf("week").minus({ weeks: 1 });
    const weekEnd =
      period === "this" ? now.startOf("week").plus({ weeks: 1 }) : now.startOf("week");
    return {
      startDate: weekStart.toFormat("yyyy-MM-dd"),
      endDate: weekEnd.toFormat("yyyy-MM-dd"),
    };
  }

  if (range === "quarterly") {
    const quarterStart =
      period === "this" ? now.startOf("quarter") : now.startOf("quarter").minus({ quarters: 1 });
    const quarterEnd =
      period === "this" ? now.startOf("quarter").plus({ quarters: 1 }) : now.startOf("quarter");
    return {
      startDate: quarterStart.toFormat("yyyy-MM-dd"),
      endDate: quarterEnd.toFormat("yyyy-MM-dd"),
    };
  }

  // annually
  const yearStart =
    period === "this" ? now.startOf("year") : now.startOf("year").minus({ years: 1 });
  const yearEnd = period === "this" ? now.startOf("year").plus({ years: 1 }) : now.startOf("year");
  return {
    startDate: yearStart.toFormat("yyyy-MM-dd"),
    endDate: yearEnd.toFormat("yyyy-MM-dd"),
  };
}

export function formatDistance(meters: number, unit: "KM" | "MI" | "HR"): string {
  if (unit === "MI") {
    const miles = meters / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
}

export function formatDriveTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function getPeriodLabel(range: TimeRange): string {
  if (range === "quarterly") return "Quarter";
  if (range === "annually") return "Year";
  return "Week";
}
