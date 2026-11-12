export type ScheduleValidatorTab = { slug: string; label: string };

/** The tabs, in order. A tab's slug is its URL segment: /schedule-validator/<slug>. */
export const SCHEDULE_VALIDATOR_TABS: ScheduleValidatorTab[] = [
  { slug: "event-bleacher-requirements", label: "Event Bleacher Requirements" },
  { slug: "overbooked-bleachers", label: "Overbooked Bleachers" },
  { slug: "bleacher-deliveries", label: "Bleacher Deliveries" },
  { slug: "driver-availability", label: "Driver Availability" },
  { slug: "driver-workload", label: "Driver Workload" },
];

export const DEFAULT_TAB = SCHEDULE_VALIDATOR_TABS[0];

/** The tab a pathname is on, or null when it is on none (e.g. /schedule-validator itself). */
export function tabFromPathname(pathname: string): ScheduleValidatorTab | null {
  const segment = pathname.split("/").filter(Boolean)[1];
  return SCHEDULE_VALIDATOR_TABS.find((t) => t.slug === segment) ?? null;
}

/** A tab's address, carrying the selected week so switching tabs keeps it. */
export function tabHref(tab: ScheduleValidatorTab, weekStart: string): string {
  return `/schedule-validator/${tab.slug}?week=${weekStart}`;
}
