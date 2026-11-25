export type AutoWorkTrackersPage = { slug: string; label: string };
export type AutoWorkTrackersSection = { label: string; pages: AutoWorkTrackersPage[] };

/** The home page: the week at a glance, above the checks and not under any heading. */
export const HOME_PAGE: AutoWorkTrackersPage = { slug: "dashboard", label: "Dashboard" };

/**
 * The side panel's checks, in order: a heading per kind of check, each with its pages. A page's
 * slug is its URL segment: /auto-work-trackers/<slug>. New checks go under the heading they check.
 */
export const AUTO_WORK_TRACKERS_SECTIONS: AutoWorkTrackersSection[] = [
  {
    label: "Events",
    pages: [
      { slug: "event-fulfilment", label: "Event Fulfilment" },
      { slug: "event-bleacher-requirements", label: "Event Bleacher Requirements" },
      { slug: "event-data", label: "Event Data" },
    ],
  },
  {
    label: "Bleachers",
    pages: [
      { slug: "overbooked-bleachers", label: "Overbooked Bleachers" },
      { slug: "bleacher-data", label: "Bleacher Data" },
    ],
  },
  {
    label: "Drivers",
    pages: [
      { slug: "driver-workload", label: "Driver Workload" },
      { slug: "driver-availability", label: "Driver Availability" },
      { slug: "driver-data", label: "Driver Data" },
    ],
  },
  {
    label: "Model",
    pages: [{ slug: "model-runs", label: "Runs" }],
  },
];

export const AUTO_WORK_TRACKERS_PAGES: AutoWorkTrackersPage[] = [
  HOME_PAGE,
  ...AUTO_WORK_TRACKERS_SECTIONS.flatMap((s) => s.pages),
];

export const DEFAULT_PAGE = HOME_PAGE;

/** Opened from a driver's menu, not listed in the panel: one driver's week as a grid. */
export const DRIVER_SCHEDULE_PAGE: AutoWorkTrackersPage = {
  slug: "driver-schedule",
  label: "Driver Schedule",
};

/** Pages reached from another page rather than the panel's list. */
const LINKED_PAGES: AutoWorkTrackersPage[] = [DRIVER_SCHEDULE_PAGE];

/** The page a pathname is on, or null when it is on none (e.g. /auto-work-trackers itself). */
export function pageFromPathname(pathname: string): AutoWorkTrackersPage | null {
  const segment = pathname.split("/").filter(Boolean)[1];
  return [...AUTO_WORK_TRACKERS_PAGES, ...LINKED_PAGES].find((p) => p.slug === segment) ?? null;
}

/** A page's address, carrying the selected zone and week so moving between pages keeps them. */
export function pageHref(page: AutoWorkTrackersPage, zoneId: string, weekStart: string): string {
  const params = new URLSearchParams();
  if (zoneId) params.set("zone", zoneId);
  params.set("week", weekStart);
  return `/auto-work-trackers/${page.slug}?${params.toString()}`;
}

/**
 * A driver's schedule inside Auto Work Trackers, keeping the zone and week, and the page it was
 * opened from (`fromSlug`) so its back button returns there.
 */
export function driverScheduleHref(
  userUuid: string,
  zoneId: string,
  weekStart: string,
  fromSlug: string | null | undefined,
): string {
  const params = new URLSearchParams();
  if (zoneId) params.set("zone", zoneId);
  params.set("week", weekStart);
  params.set("user", userUuid);
  if (fromSlug) params.set("from", fromSlug);
  return `/auto-work-trackers/${DRIVER_SCHEDULE_PAGE.slug}?${params.toString()}`;
}

/** Where the schedule's back button goes: the listed page it came from, else the Dashboard. */
export function scheduleBackHref(
  fromSlug: string | null | undefined,
  zoneId: string,
  weekStart: string,
): string {
  const from = AUTO_WORK_TRACKERS_PAGES.find((p) => p.slug === fromSlug) ?? DEFAULT_PAGE;
  return pageHref(from, zoneId, weekStart);
}
