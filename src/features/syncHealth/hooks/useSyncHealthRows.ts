"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { buildSyncHealthRows, type SyncHealthSourceRow } from "../utils/buildSyncHealthRows";
import type { SyncHealthRow } from "../utils/buildSyncHealthRows";

/**
 * Every active driver's reported bucket count, biggest first.
 *
 * `DriverSyncHealth` and `DriverSyncHealthUsers` are client-side names for rows
 * of Drivers and Users that the web sync rules send to developers
 * (br_powersync/config/sync_rules.yaml). A developer with no office role syncs
 * neither table otherwise, so this is what makes the page work for its own
 * audience; the alias also keeps a developer who IS an office role from
 * getting the same Drivers row twice with different columns.
 *
 * The rows arrive unordered; sorting and the percent-of-limit maths are pure
 * and live in `buildSyncHealthRows`.
 */
export function useSyncHealthRows(): { rows: SyncHealthRow[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("DriverSyncHealth as h")
        .leftJoin("DriverSyncHealthUsers as u", "u.id", "h.user_uuid")
        .select([
          "h.id as id",
          "u.first_name as first_name",
          "u.last_name as last_name",
          "h.app_version as app_version",
          "h.app_platform as app_platform",
          "h.bucket_count as bucket_count",
          "h.sync_version as sync_version",
          "h.bucket_count_reported_at as bucket_count_reported_at",
        ])
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<SyncHealthSourceRow>());

  return {
    rows: useMemo(() => buildSyncHealthRows(data ?? []), [data]),
    isLoading,
  };
}
