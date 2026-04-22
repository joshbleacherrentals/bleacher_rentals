"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type InspectionListRow = {
  workTrackerId: string;
  workTrackerDate: string | null;
  inspectionUuid: string;
  inspectionKind: "pre" | "post";
  createdAt: string | null;
  walkAroundComplete: number | null;
  issuesFound: number | null;
  issueDescription: string | null;
  bleacherUuid: string | null;
  bleacherNumber: number | null;
  driverUuid: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
};

type RawInspectionRow = {
  workTrackerId: string;
  workTrackerDate: string | null;
  preInspectionUuid: string | null;
  postInspectionUuid: string | null;
  preCreatedAt: string | null;
  preWalkAroundComplete: number | null;
  preIssuesFound: number | null;
  preIssueDescription: string | null;
  postCreatedAt: string | null;
  postWalkAroundComplete: number | null;
  postIssuesFound: number | null;
  postIssueDescription: string | null;
  bleacherUuid: string | null;
  bleacherNumber: number | null;
  driverUuid: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
};

/**
 * Reactive list of WorkTrackerInspections (pre + post) joined to the parent
 * WorkTracker for bleacher / driver context. Optional filters by bleacher and
 * driver are applied at the SQL layer.
 *
 * Each work tracker can produce up to two rows (one per inspection slot) so we
 * fan-out client-side after fetching.
 */
export function useInspections(filters: {
  bleacherUuid?: string | null;
  driverUuid?: string | null;
}): InspectionListRow[] {
  const { bleacherUuid, driverUuid } = filters;

  const compiled = useMemo(() => {
    let q = db
      .selectFrom("WorkTrackers as wt")
      .leftJoin("WorkTrackerInspections as pre", "pre.id", "wt.pre_inspection_uuid")
      .leftJoin("WorkTrackerInspections as post", "post.id", "wt.post_inspection_uuid")
      .leftJoin("Bleachers as b", "b.id", "wt.bleacher_uuid")
      .leftJoin("Drivers as d", "d.id", "wt.driver_uuid")
      .leftJoin("Users as u", "u.id", "d.user_uuid")
      .select([
        "wt.id as workTrackerId",
        "wt.date as workTrackerDate",
        "wt.pre_inspection_uuid as preInspectionUuid",
        "wt.post_inspection_uuid as postInspectionUuid",
        "pre.created_at as preCreatedAt",
        "pre.walk_around_complete as preWalkAroundComplete",
        "pre.issues_found as preIssuesFound",
        "pre.issue_description as preIssueDescription",
        "post.created_at as postCreatedAt",
        "post.walk_around_complete as postWalkAroundComplete",
        "post.issues_found as postIssuesFound",
        "post.issue_description as postIssueDescription",
        "wt.bleacher_uuid as bleacherUuid",
        "b.bleacher_number as bleacherNumber",
        "wt.driver_uuid as driverUuid",
        "u.first_name as driverFirstName",
        "u.last_name as driverLastName",
      ])
      .where((eb) =>
        eb.or([
          eb("wt.pre_inspection_uuid", "is not", null),
          eb("wt.post_inspection_uuid", "is not", null),
        ]),
      );

    if (bleacherUuid) q = q.where("wt.bleacher_uuid", "=", bleacherUuid);
    if (driverUuid) q = q.where("wt.driver_uuid", "=", driverUuid);

    return q.orderBy("wt.date", "desc").compile();
  }, [bleacherUuid, driverUuid]);

  const { data = [] } = useTypedQuery(compiled, expect<RawInspectionRow>());

  return useMemo(() => {
    const rows: InspectionListRow[] = [];
    for (const r of data) {
      if (r.preInspectionUuid) {
        rows.push({
          workTrackerId: r.workTrackerId,
          workTrackerDate: r.workTrackerDate,
          inspectionUuid: r.preInspectionUuid,
          inspectionKind: "pre",
          createdAt: r.preCreatedAt,
          walkAroundComplete: r.preWalkAroundComplete,
          issuesFound: r.preIssuesFound,
          issueDescription: r.preIssueDescription,
          bleacherUuid: r.bleacherUuid,
          bleacherNumber: r.bleacherNumber,
          driverUuid: r.driverUuid,
          driverFirstName: r.driverFirstName,
          driverLastName: r.driverLastName,
        });
      }
      if (r.postInspectionUuid) {
        rows.push({
          workTrackerId: r.workTrackerId,
          workTrackerDate: r.workTrackerDate,
          inspectionUuid: r.postInspectionUuid,
          inspectionKind: "post",
          createdAt: r.postCreatedAt,
          walkAroundComplete: r.postWalkAroundComplete,
          issuesFound: r.postIssuesFound,
          issueDescription: r.postIssueDescription,
          bleacherUuid: r.bleacherUuid,
          bleacherNumber: r.bleacherNumber,
          driverUuid: r.driverUuid,
          driverFirstName: r.driverFirstName,
          driverLastName: r.driverLastName,
        });
      }
    }
    rows.sort((a, b) => {
      const av = a.createdAt ?? a.workTrackerDate ?? "";
      const bv = b.createdAt ?? b.workTrackerDate ?? "";
      return bv.localeCompare(av);
    });
    return rows;
  }, [data]);
}
