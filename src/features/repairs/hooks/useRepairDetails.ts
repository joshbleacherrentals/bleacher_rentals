"use client";

import { useMemo } from "react";
import { useAcknowledgements } from "@/app/damage-reports/_lib/acknowledgements";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  buildReportDetailsQuery,
  buildReportPhotosQuery,
  buildServiceBleacherQuery,
  type RawReportDetailRow,
  type RawReportPhotoRow,
  type RawServiceBleacherRow,
} from "../db/serviceWindowQueries";
import { buildDamageReportViews, type DamageReportView } from "../utils/repairDetails";
import type { ReportedReport } from "../utils/repairRows";

/**
 * What the service window and the damage report window read beyond the list: the card of the
 * service's bleacher, and the details, photos and confirmations of the damage reports found for a
 * repair or a service. Reactive. docs/specs/repairs-06-expanded-row.md §3.
 */

/** The card of one bleacher; null while the query loads or when the bleacher is not on the device. */
export function useServiceBleacher(bleacherUuid: string | null): {
  bleacher: RawServiceBleacherRow | null;
  isLoading: boolean;
} {
  const compiled = useMemo(
    () => buildServiceBleacherQuery(bleacherUuid ?? "__none__"),
    [bleacherUuid],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<RawServiceBleacherRow>());
  return { bleacher: data?.[0] ?? null, isLoading };
}

/** The views of the reports found for a repair or a service, in the order they were found. */
export function useDamageReportViews(
  reported: readonly ReportedReport[],
  timezone: string,
): { reports: DamageReportView[]; isLoading: boolean } {
  // The ids come from a list that may be a new array on every render; the joined text is stable.
  const key = reported.map((r) => r.id).join(",");
  const ids = useMemo(() => (key ? key.split(",") : []), [key]);

  const detailsCompiled = useMemo(() => buildReportDetailsQuery(ids), [ids]);
  const photosCompiled = useMemo(() => buildReportPhotosQuery(ids), [ids]);
  const details = useTypedQuery(detailsCompiled, expect<RawReportDetailRow>());
  const photos = useTypedQuery(photosCompiled, expect<RawReportPhotoRow>());
  const { byReport } = useAcknowledgements(ids);

  const reports = useMemo(
    () =>
      buildDamageReportViews({
        reported,
        details: details.data ?? [],
        photos: photos.data ?? [],
        acknowledgements: byReport,
        timezone,
      }),
    [reported, details.data, photos.data, byReport, timezone],
  );

  return { reports, isLoading: details.isLoading || photos.isLoading };
}
