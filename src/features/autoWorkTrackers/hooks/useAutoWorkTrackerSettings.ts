"use client";

import { useMemo } from "react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { settingsQuery } from "../db/settings";
import { resolveSettings, type PlannerSettings, type SettingsRow } from "../planner/settings";

/**
 * The Auto Work Trackers settings: the stored row (null = not synced, e.g. a role that does not get
 * it) and the values to use, each the stored value or its default.
 */
export function useAutoWorkTrackerSettings(): {
  row: SettingsRow | null;
  settings: PlannerSettings;
  isLoading: boolean;
} {
  const compiled = useMemo(() => settingsQuery(), []);
  const { data, isLoading } = useTypedQuery(compiled, expect<SettingsRow>());
  const row = data?.[0] ?? null;
  return { row, settings: useMemo(() => resolveSettings(row), [row]), isLoading };
}
