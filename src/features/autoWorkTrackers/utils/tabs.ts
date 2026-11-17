export type AutoWorkTrackersTab = { slug: string; label: string };

/** The tabs, in order. A tab's slug is its URL segment: /auto-work-trackers/<slug>. */
export const AUTO_WORK_TRACKERS_TABS: AutoWorkTrackersTab[] = [
  { slug: "schedule", label: "Schedule" },
  { slug: "bleacher-deliveries", label: "Bleacher Deliveries" },
  { slug: "event-dashboard", label: "Event Dashboard" },
];

export const DEFAULT_TAB = AUTO_WORK_TRACKERS_TABS[0];

/** The tab a pathname is on, or null when it is on none (e.g. /auto-work-trackers itself). */
export function tabFromPathname(pathname: string): AutoWorkTrackersTab | null {
  const segment = pathname.split("/").filter(Boolean)[1];
  return AUTO_WORK_TRACKERS_TABS.find((t) => t.slug === segment) ?? null;
}

/** A tab's address, carrying the selected zone and week so switching tabs keeps them. */
export function tabHref(tab: AutoWorkTrackersTab, zoneId: string, weekStart: string): string {
  const params = new URLSearchParams();
  if (zoneId) params.set("zone", zoneId);
  params.set("week", weekStart);
  return `/auto-work-trackers/${tab.slug}?${params.toString()}`;
}
