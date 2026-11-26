/**
 * The planning tabs of Work Trackers, each a side panel (zone, week, pages) beside the open page:
 *
 *  - Verify (/work-trackers/verify): how good a zone's week is, whoever made its work trackers
 *    (the model or by hand): events covered, bleachers not double-booked, drivers not overloaded,
 *    and after the week, Proof of Delivery (the GPS proof of each trip).
 *  - Auto Generate (/work-trackers/auto-generate): the AI planner and what it needs. Its landing page holds
 *    Generate; the panel holds the data the model reads (drivers, events, bleacher moves), its
 *    Advanced settings, its runs and the bulk delete of its drafts.
 *
 * Pure.
 */

export type AreaKey = "check" | "auto";
export type AutoWorkTrackersPage = {
  slug: string;
  label: string;
  /** A few words under the label in the panel: the question the page answers. */
  tagline?: string;
  /** A sentence or two under the page's title: what it shows and what to do there. */
  description?: string;
};
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
    label: "Verify",
    base: "/work-trackers/verify",
    home: {
      slug: "dashboard",
      label: "Dashboard",
      tagline: "The week at a glance",
      description:
        "Every event starting this week with its bleachers, on the dashboard grid. Switch to the map to see each driver's route, day by day. Read-only.",
    },
    // Too few pages for headings: one plain list, events, then bleachers, then drivers.
    sections: [
      {
        label: "",
        pages: [
          {
            slug: "event-fulfilment",
            label: "Event Fulfilment",
            tagline: "Is every bleacher ready for its event?",
            description:
              "Each event starting this week with its bleachers: where each one was last, how long there is to move it and how far it has to go. A tick means it is already there; Hide ready leaves only what still needs a move.",
          },
          {
            slug: "event-bleacher-requirements",
            label: "Event Bleacher Requirements",
            tagline: "Right bleachers on each event?",
            description:
              "Each booked event starting this week: do the bleachers assigned match what the event requires, by type? Click an event to compare the two.",
          },
          {
            slug: "overbooked-bleachers",
            label: "Overbooked Bleachers",
            tagline: "Any bleacher on two events at once?",
            description:
              "The zone's bleachers booked on two events whose dates overlap this week. Open one to see which events clash and on which days.",
          },
          {
            slug: "driver-workload",
            label: "Driver Workload",
            tagline: "Anyone driving too much?",
            description:
              "A row per driver and a column per day: hours of driving (hauling and deadhead) and how many trips. A day over 12 hours shows in red.",
          },
          {
            slug: "driver-availability",
            label: "Driver Availability",
            tagline: "Anyone booked on a day off?",
            description:
              "A row per driver and a column per day: days off and trips. A trip on a day the driver marked unavailable is a conflict, in red.",
          },
          {
            slug: "delivery-proof",
            label: "Proof of Delivery",
            tagline: "Did each delivery get there?",
            description:
              "A row per driver and a column per day: every trip counted by its GPS proof. Verified means the bleacher's GPS stood within 500 m of the drop-off after the driver tapped Complete; overdue means its day has passed and nobody tapped Complete. The check runs daily; Check now runs it at once.",
          },
        ],
      },
    ],
  },
  auto: {
    key: "auto",
    label: "Auto Generate",
    base: "/work-trackers/auto-generate",
    home: { slug: "", label: "Generate", tagline: "Plan the week with AI" },
    // Too few pages for headings: one plain list (a section with no label shows no heading). The
    // data the model reads, where missing addresses are fixed (Driver Data follows the zone only),
    // then its runs.
    sections: [
      {
        label: "",
        pages: [
          {
            slug: "driver-data",
            label: "Driver Data",
            tagline: "Drivers the model can use",
            description:
              "The zone's active drivers and what the model needs from each, above all a home address to start and end the day. Fix a missing address, or leave a driver out of the model; removed drivers are listed below with a way back in. Applies to every week.",
          },
          {
            slug: "event-data",
            label: "Event Data",
            tagline: "Event addresses the model needs",
            description:
              "The events this week's trips touch: those starting this week and those bleachers are picked up from. Each needs an address the model can route to; a red X says what is missing, and clicking the address fixes it.",
          },
          {
            slug: "bleacher-data",
            label: "Bleacher Data",
            tagline: "Every pickup and drop-off address",
            description:
              "Every move of the zone's bleachers this week, the trips still needed and the work trackers already made, with a check on its pickup and drop-off address. Click a red one to fix it; the fix applies everywhere that address is used.",
          },
          {
            slug: "model-runs",
            label: "Runs",
            tagline: "What the model did, and what changed",
            description:
              "Every time Generate ran for this zone and week: who ran it and with which settings, and for each trip it planned whether it was kept, edited or deleted, with the reasons people gave.",
          },
        ],
      },
    ],
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

/** The tab that lists a page (Verify before Auto Generate), or null when none does. */
export function areaOfSlug(slug: string): Area | null {
  return [AREAS.check, AREAS.auto].find((a) => areaPages(a).some((p) => p.slug === slug)) ?? null;
}

/**
 * Where an old /auto-work-trackers/<slug> address now lives, keeping its query: the tab that lists
 * the page, else Auto Generate's landing.
 */
export function legacyAutoWorkTrackersHref(slug: string | undefined, search: string): string {
  const q = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  const area = slug ? areaOfSlug(slug) : null;
  if (area && slug) return `${area.base}/${slug}${q}`;
  return `${AREAS.auto.base}${q}`;
}
