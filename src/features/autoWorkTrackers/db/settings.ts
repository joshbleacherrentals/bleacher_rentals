import { db } from "@/components/providers/SystemProvider";
import type { SettingColumn } from "../planner/settings";

export const SETTINGS_ROW_ID = "global";

/** The one AutoWorkTrackerSettings row. */
export function settingsQuery() {
  return db
    .selectFrom("AutoWorkTrackerSettings")
    .select([
      "objective",
      "employee_priority",
      "employee_priority_minutes",
      "max_day_minutes",
      "setup_minutes",
      "teardown_minutes",
      "day_start_hour",
      "search_seconds",
      "updated_at",
      "updated_by_user_uuid",
    ])
    .where("id", "=", SETTINGS_ROW_ID)
    .compile();
}

/**
 * Saves one setting: a value, or null to go back to the default. Records who changed it and when.
 */
export function saveSettingStatement(
  column: SettingColumn,
  value: string | number | null,
  userUuid: string | null,
  now: string = new Date().toISOString(),
) {
  return db
    .updateTable("AutoWorkTrackerSettings")
    .set({ [column]: value, updated_at: now, updated_by_user_uuid: userUuid })
    .where("id", "=", SETTINGS_ROW_ID)
    .compile();
}
