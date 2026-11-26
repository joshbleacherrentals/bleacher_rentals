import { driverScheduleHref, type Area } from "@/features/autoWorkTrackers/utils/pages";

/**
 * The pages a driver's menu links to, in menu order. Every page is keyed by the driver's user (the
 * Users row), not the Drivers row. `newTab` links open beside the checks; the schedule opens in
 * place, inside the planning tab it was opened from, and its back button returns to `fromSlug`. Adding a link is
 * adding an entry. Pure.
 */
export type DriverLink = { key: string; label: string; href: string; newTab: boolean };

export function driverLinks({
  area,
  userUuid,
  weekStart,
  zoneId,
  fromSlug,
}: {
  /** The planning tab the menu is in (Plan Check or Auto Plan). */
  area: Area;
  userUuid: string;
  /** The Monday of the selected week, "YYYY-MM-DD". */
  weekStart: string;
  zoneId: string;
  /** The page of that tab the menu is on. */
  fromSlug: string | null | undefined;
}): DriverLink[] {
  const user = encodeURIComponent(userUuid);
  return [
    {
      key: "schedule",
      label: "Open driver schedule",
      href: driverScheduleHref(area, userUuid, zoneId, weekStart, fromSlug),
      newTab: false,
    },
    {
      key: "profile",
      label: "Open driver profile",
      href: `/team/${user}/edit/driver`,
      newTab: true,
    },
    {
      key: "week",
      label: "Open work tracker week",
      href: `/work-trackers/${encodeURIComponent(weekStart)}/${user}`,
      newTab: true,
    },
  ];
}
