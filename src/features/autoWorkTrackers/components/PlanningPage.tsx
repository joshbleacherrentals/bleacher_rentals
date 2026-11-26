import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AREAS, areaSlugs, type AreaKey } from "../utils/pages";
import { PLANNING_PAGES } from "./planningPages";

/**
 * A planning tab's page by its slug (/work-trackers/<tab>/<slug>): the shared component for that
 * slug, when the tab lists it. Anything else is a 404. Server component.
 */
export function PlanningPage({ areaKey, slug }: { areaKey: AreaKey; slug: string }) {
  const Page = PLANNING_PAGES[slug];
  if (!Page || !areaSlugs(AREAS[areaKey]).includes(slug)) notFound();
  return (
    <Suspense>
      <Page />
    </Suspense>
  );
}
