"use client";

import { db } from "@/components/providers/SystemProvider";
import { typedExecute, expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useUser } from "@clerk/nextjs";
import { usePowerSync } from "@powersync/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DashboardFilterState, type YAxis } from "./types";

type UserContextRow = {
  userUuid: string;
  accountManagerUuid: string | null;
};

type SettingsRow = {
  yAxis: string | null;
  rows: string | null;
  stateProvinces: string | null;
  onlyShowMyEvents: number | null;
  optimizationMode: number | null;
  showAddressTooltip: number | null;
  showDistanceTooltip: number | null;
  rowsQuickFilter: number | null;
  zoneUuids: string | null;
  showUnassignedZone: number | null;
  hideAllSubrentals: number | null;
};

const parseJsonArray = <T>(value: string | null | undefined, fallback: T[]): T[] => {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
};

const toBool = (value: number | boolean | null | undefined): boolean => {
  if (typeof value === "boolean") return value;
  return Boolean(value);
};

const toYAxis = (value: string | null | undefined): YAxis => {
  return value === "Events" ? "Events" : "Bleachers";
};

export function useDashboardFilterSettings(): {
  state: DashboardFilterState | null;
  userContext: UserContextRow | null;
  setField: <K extends keyof DashboardFilterState>(
    key: K,
    value: DashboardFilterState[K],
  ) => Promise<void>;
} {
  const powerSync = usePowerSync();
  const [hasInitialSync, setHasInitialSync] = useState(false);

  const { user } = useUser();
  const clerkUserId = user?.id ?? null;

  // Always compile + query (hook rules); use a sentinel when signed out.
  const clerkUserIdForQuery = clerkUserId ?? "__no_clerk_user__";

  const compiledUserContext = useMemo(() => {
    return db
      .selectFrom("Users as u")
      .leftJoin("AccountManagers as am", (join) =>
        join.onRef("am.user_uuid", "=", "u.id").on("am.is_active", "=", 1),
      )
      .select(["u.id as userUuid", "am.id as accountManagerUuid"])
      .where("u.clerk_user_id", "=", clerkUserIdForQuery)
      .limit(1)
      .compile();
  }, [clerkUserIdForQuery]);

  const {
    data: userContextData,
    isLoading: isUserContextLoading,
    isFetching: isUserContextFetching,
  } = useTypedQuery(compiledUserContext, expect<UserContextRow>());
  const userContext = clerkUserId ? (userContextData?.[0] ?? null) : null;

  const userUuidForQuery = userContext?.userUuid ?? "__no_user__";

  const compiledSettings = useMemo(() => {
    return db
      .selectFrom("DashboardFilterSettings as s")
      .select([
        "s.y_axis as yAxis",
        "s.rows as rows",
        "s.state_provinces as stateProvinces",
        "s.only_show_my_events as onlyShowMyEvents",
        "s.optimization_mode as optimizationMode",
        "s.show_address_tooltip as showAddressTooltip",
        "s.show_distance_tooltip as showDistanceTooltip",
        "s.rows_quick_filter as rowsQuickFilter",
        "s.zone_uuids as zoneUuids",
        "s.show_unassigned_zone as showUnassignedZone",
        "s.hide_all_subrentals as hideAllSubrentals",
      ])
      .where("s.user_uuid", "=", userUuidForQuery)
      .limit(1)
      .compile();
  }, [userUuidForQuery]);

  const {
    data: settingsData,
    isLoading: isSettingsLoading,
    isFetching: isSettingsFetching,
  } = useTypedQuery(compiledSettings, expect<SettingsRow>());
  const settingsRow = userContext ? (settingsData?.[0] ?? null) : null;

  // Ensure a settings row exists (local-first insert; sync will follow)
  useEffect(() => {
    // Don’t interpret "no rows" as "missing" until queries are done.
    if (isUserContextLoading || isUserContextFetching) return;
    if (isSettingsLoading || isSettingsFetching) return;

    if (!userContext?.userUuid) return;
    if (settingsRow) return;

    const nowIso = new Date().toISOString();

    const insert = db
      .insertInto("DashboardFilterSettings")
      .values({
        id: userContext.userUuid,
        created_at: nowIso,
        updated_at: nowIso,
        user_uuid: userContext.userUuid,
        y_axis: "Bleachers",
        summer_home_base_uuids: "[]",
        winter_home_base_uuids: "[]",
        rows: "[]",
        state_provinces: "[]",
        only_show_my_events: 1,
        optimization_mode: 0,
        show_address_tooltip: 0,
        show_distance_tooltip: 0,
        season: null,
        account_manager_uuid: null,
        rows_quick_filter: null,
        zone_uuids: "[]",
        show_unassigned_zone: 0,
        hide_all_subrentals: 0,
      })
      .compile();

    typedExecute(insert).catch((error: any) => {
      const msg = String(error?.message ?? error);
      // expected when row already exists
      if (msg.toLowerCase().includes("unique") || msg.toLowerCase().includes("constraint")) return;
      console.error("Failed to create DashboardFilterSettings row:", error);
    });
  }, [
    isSettingsFetching,
    isSettingsLoading,
    isUserContextFetching,
    isUserContextLoading,
    settingsRow,
    userContext?.accountManagerUuid,
    userContext?.userUuid,
  ]);

  const state = useMemo<DashboardFilterState | null>(() => {
    if (!settingsRow) return null;

    return {
      yAxis: toYAxis(settingsRow.yAxis),
      rows: parseJsonArray<number>(settingsRow.rows, []),
      stateProvinces: parseJsonArray<number>(settingsRow.stateProvinces, []),
      onlyShowMyEvents: toBool(settingsRow.onlyShowMyEvents),
      optimizationMode: toBool(settingsRow.optimizationMode),
      showAddressTooltip: toBool(settingsRow.showAddressTooltip),
      showDistanceTooltip: toBool(settingsRow.showDistanceTooltip),
      rowsQuickFilter:
        settingsRow.rowsQuickFilter === 10 || settingsRow.rowsQuickFilter === 15
          ? (settingsRow.rowsQuickFilter as 10 | 15)
          : null,
      zoneUuids: parseJsonArray<string>(settingsRow.zoneUuids, []),
      showUnassignedZone: toBool(settingsRow.showUnassignedZone),
      hideAllSubrentals: toBool(settingsRow.hideAllSubrentals),
    };
  }, [settingsRow]);

  const updateDb = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!userContext?.userUuid) return;

      const nowIso = new Date().toISOString();
      const compiled = db
        .updateTable("DashboardFilterSettings")
        .set({
          ...(patch as any),
          updated_at: nowIso,
        } as any)
        .where("user_uuid", "=", userContext.userUuid)
        .compile();

      await typedExecute(compiled);
    },
    [userContext?.userUuid],
  );

  const setField = useCallback(
    async <K extends keyof DashboardFilterState>(key: K, value: DashboardFilterState[K]) => {
      switch (key) {
        case "yAxis":
          return updateDb({ y_axis: value as YAxis });

        case "rows":
          return updateDb({ rows: JSON.stringify(value) });

        case "stateProvinces":
          return updateDb({ state_provinces: JSON.stringify(value) });

        case "onlyShowMyEvents":
          return updateDb({ only_show_my_events: value ? 1 : 0 });

        case "optimizationMode":
          return updateDb({ optimization_mode: value ? 1 : 0 });

        case "showAddressTooltip":
          return updateDb({ show_address_tooltip: value ? 1 : 0 });

        case "showDistanceTooltip":
          return updateDb({ show_distance_tooltip: value ? 1 : 0 });

        case "rowsQuickFilter":
          return updateDb({ rows_quick_filter: value });

        case "zoneUuids":
          return updateDb({ zone_uuids: JSON.stringify(value) });

        case "showUnassignedZone":
          return updateDb({ show_unassigned_zone: value ? 1 : 0 });

        case "hideAllSubrentals":
          return updateDb({ hide_all_subrentals: value ? 1 : 0 });

        default:
          return;
      }
    },
    [updateDb],
  );

  return { state, userContext, setField };
}
