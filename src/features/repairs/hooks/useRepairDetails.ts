"use client";

import { useMemo } from "react";
import { useSession } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { useAcknowledgements } from "@/app/damage-reports/_lib/acknowledgements";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { buildVendorAddressQuery, type RawVendorAddressRow } from "../db/repairWindowQueries";
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
import {
  buildRepairFileRows,
  formatVendorAddress,
  type RawRepairFileRow,
  type RepairFileRow,
} from "../utils/repairWindow";

/**
 * What the service window, the damage report window and the repair window read beyond the list: the
 * card of the service's bleacher, the details, photos and confirmations of the damage reports found
 * for a repair or a service, the address of a repair's vendor, and the files of a repair. All are
 * reactive except the files, which are read from Supabase (spec 07 D99).
 * docs/specs/repairs-06-expanded-row.md §3 and docs/specs/repairs-07-repair-window.md §2.3, §2.5, §3.
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

/** The vendor's address as one line, or null (no vendor, no address, or it has not synced). */
export function useVendorAddress(vendorUuid: string | null): {
  address: string | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => buildVendorAddressQuery(vendorUuid ?? "__none__"), [vendorUuid]);
  const { data, isLoading } = useTypedQuery(compiled, expect<RawVendorAddressRow>());
  const row = data?.[0];
  return { address: row ? formatVendorAddress(row) : null, isLoading };
}

const FILE_PHOTOS_TABLE = "MaintenancePhotos";

/**
 * The files of a repair, read directly from Supabase: the table is not synced to the device (D99).
 * It is mounted only for a role that may read the table (D102), so the others make no request. The
 * request waits for the Clerk session, because an anonymous request would get an empty list and
 * hide the files until the next read. "error" covers offline, a lost session and a refused request.
 */
export function useRepairFiles(
  repairId: string,
  timezone: string,
): { state: "loading" | "error" | "ready"; files: RepairFileRow[]; raw: RawRepairFileRow[] } {
  const supabase = useClerkSupabaseClient();
  const { isLoaded, session } = useSession();
  const query = useQuery({
    queryKey: ["repair-files", repairId, session?.id ?? null],
    enabled: isLoaded && !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(FILE_PHOTOS_TABLE)
        .select("id, photo_path, created_at")
        .eq("maintenance_event_uuid", repairId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RawRepairFileRow[];
    },
  });

  const raw = useMemo(() => query.data ?? [], [query.data]);
  const files = useMemo(() => buildRepairFileRows(raw, timezone), [raw, timezone]);
  const state = query.isError ? "error" : query.isSuccess ? "ready" : "loading";
  // `raw` lets the Edit window name the rows that remain after a removal (09b3 D202).
  return { state, files, raw };
}
