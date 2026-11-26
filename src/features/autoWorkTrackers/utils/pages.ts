/**
 * The planning tabs of Work Trackers, each a side panel (zone, week, pages) beside the open page:
 *
 *  - Plan Check (/work-trackers/check): how good a zone's week is, whoever made its work trackers
 *    (the model or by hand): events covered, bleachers not double-booked, drivers not overloaded.
 *  - Auto Plan (/work-trackers/auto): the AI planner and what it needs. Its landing page holds
 *    Generate; the panel holds the data the model reads (drivers, events, bleacher moves), its
 *    Advanced settings, its runs and the bulk delete of its drafts.
 *  - Proof of Delivery (/work-trackers/proof): the GPS proof after the week.
 *
 * Pure.
 */

export type AreaKey = "check" | "auto" | "proof";
export type AutoWorkTrackersPage = { slug: string; label: string };
export type AutoWorkTrackersSection = { label: string; pages: AutoWorkTrackersPage[] };
export type Area = {
  key: AreaKey;
  label: string;
  base: string;
  /** The tab's first page, above the headings; slug "" is the tab's own address. */
  home: AutoWorkTrackersPage;
  sections: AutoWorkTrackersSection[];
};

export const AREAS: Record<AreaKey, Area> = {
  check: {
    key: "check",
    label: "Plan Check",
    base: "/work-trackers/check",
    home: { slug: "dashboard", label: "Dashboard" },
    sections: [
      {
        label: "Events",
        pages: [
          { slug: "event-fulfilment", label: "Event Fulfilment" },
          { slug: "event-bleacher-requirements", label: "Event Bleacher Requirements" },
        ],
      },
      {
        label: "Bleachers",
        pages: [{ slug: "overbooked-bleachers", label: "Overbooked Bleachers" }],
      },
      {
        label: "Drivers",
        pages: [
          { slug: "driver-workload", label: "Driver Workload" },
          { slug: "driver-availability", label: "Driver Availability" },
        ],
      },
    ],
  },
  auto: {
    key: "auto",
    label: "Auto Plan",
    base: "/work-trackers/auto",
    home: { slug: "", label: "Generate" },
    sections: [
      {
        // What the model reads; missing addresses are fixed here. Driver Data follows the zone only.
        label: "Model data",
        pages: [
          { slug: "driver-data", label: "Driver Data" },
          { slug: "event-data", label: "Event Data" },
          { slug: "bleacher-data", label: "Bleacher Data" },
        ],
      },
      { label: "Model", pages: [{ slug: "model-runs", label: "Runs" }] },
    ],
  },
  proof: {
    key: "proof",
    label: "Proof of Delivery",
    base: "/work-trackers/proof",
    home: { slug: "", label: "Proof of Delivery" },
    sections: [],
  },
};

/** Opened from a driver's menu, not listed in the panel: one driver's week as a grid. */
export const DRIVER_SCHEDULE_PAGE: AutoWorkTrackersPage = {
  slug: "driver-schedule",
  label: "Driver Schedule",
};

/** A tab's listed pages: its home, then every heading's pages. */
export function areaPages(area: Area): AutoWorkTrackersPage[] {
  return [area.home, ...area.sections.flatMap((s) => s.pages)];
}

/** Every slug the tab can open: its listed pages and the driver schedule. */
export function areaSlugs(area: Area): string[] {
  return [...areaPages(area), DRIVER_SCHEDULE_PAGE].map((p) => p.slug);
}

/** The tab and page a pathname is on, or null when it is on none. */
export function locatePage(
  pathname: string,
): { area: Area; page: AutoWorkTrackersPage | null } | null {
  const path = pathname.replace(/\/+$/, "");
  const area = Object.values(AREAS).find((a) => path === a.base || path.startsWith(`${a.base}/`));
  if (!area) return null;
  const slug = path.slice(area.base.length).split("/").filter(Boolean)[0] ?? "";
  const page = [...areaPages(area), DRIVER_SCHEDULE_PAGE].find((p) => p.slug === slug) ?? null;
  return { area, page };
}

const query = (zoneId: string, weekStart: string, extra: Record<string, string> = {}) => {
  const params = new URLSearchParams();
  if (zoneId) params.set("zone", zoneId);
  if (weekStart) params.set("week", weekStart);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
};

/** A page's address in its tab, carrying the selected zone and week. */
export function pageHref(
  area: Area,
  page: AutoWorkTrackersPage,
  zoneId: string,
  weekStart: string,
): string {
  return `${area.base}${page.slug ? `/${page.slug}` : ""}${query(zoneId, weekStart)}`;
}

/** A tab's first page, carrying the selected zone and week (for the tabs across the top). */
export function areaHref(area: Area, zoneId: string, weekStart: string): string {
  return pageHref(area, area.home, zoneId, weekStart);
}

/**
 * A driver's schedule inside a tab, keeping the zone and week, and the page it was opened from
 * (`fromSlug`) so its back button returns there.
 */
export function driverScheduleHref(
  area: Area,
  userUuid: string,
  zoneId: string,
  weekStart: string,
  fromSlug: string | null | undefined,
): string {
  const extra: Record<string, string> = { user: userUuid };
  if (fromSlug) extra.from = fromSlug;
  return `${area.base}/${DRIVER_SCHEDULE_PAGE.slug}${query(zoneId, weekStart, extra)}`;
}

/** Where the schedule's back button goes: the listed page it came from, else the tab's home. */
export function scheduleBackHref(
  area: Area,
  fromSlug: string | null | undefined,
  zoneId: string,
  weekStart: string,
): string {
  const from = areaPages(area).find((p) => p.slug === fromSlug) ?? area.home;
  return pageHref(area, from, zoneId, weekStart);
}

/** The tab that lists a page (Plan Check before Auto Plan), or null when none does. */
export function areaOfSlug(slug: string): Area | null {
  return [AREAS.check, AREAS.auto].find((a) => areaPages(a).some((p) => p.slug === slug)) ?? null;
}

/**
 * Where an old /auto-work-trackers/<slug> address now lives, keeping its query: Delivery Proof in
 * Proof of Delivery, any other page in the tab that lists it, else Auto Plan's landing.
 */
export function legacyAutoWorkTrackersHref(slug: string | undefined, search: string): string {
  const q = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  if (slug === "delivery-proof") return `${AREAS.proof.base}${q}`;
  const area = slug ? areaOfSlug(slug) : null;
  if (area && slug) return `${area.base}/${slug}${q}`;
  return `${AREAS.auto.base}${q}`;
}
