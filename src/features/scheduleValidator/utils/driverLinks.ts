/**
 * The pages a driver's menu links to, in menu order. Both pages are keyed by the driver's user (the
 * Users row), not the Drivers row. Adding a link is adding an entry. Pure.
 */
export type DriverLink = { key: string; label: string; href: string };

export function driverLinks({
  userUuid,
  weekStart,
}: {
  userUuid: string;
  /** The Monday of the selected week, "YYYY-MM-DD". */
  weekStart: string;
}): DriverLink[] {
  const user = encodeURIComponent(userUuid);
  return [
    { key: "profile", label: "Open driver profile", href: `/team/${user}/edit/driver` },
    {
      key: "week",
      label: "Open work tracker week",
      href: `/work-trackers/${encodeURIComponent(weekStart)}/${user}`,
    },
  ];
}
