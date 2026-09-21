"use client";
import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery, typedExecute } from "@/lib/powersync/typedQuery";
import { useUser } from "@clerk/nextjs";
import { businessToday, hidePastAlerts } from "../util/pastAlerts";

export type WorkTrackerAlertRow = {
  userAlertId: string;
  alertId: string;
  entityUuid: string | null;
  entityType: string | null;
  entityDescription: string | null;
  title: string | null;
  message: string | null;
  dismissed: number | null;
  dismissedUntil: string | null;
  createdAt: string | null;
  /** The work tracker's date; its alerts are hidden once it is past. */
  entityDate: string | null;
};

type UserRow = { userUuid: string };

export function useWorkTrackerAlerts(workTrackerUuid: string | null) {
  const { user } = useUser();
  const clerkUserId = user?.id ?? "__no_clerk_user__";
  const today = businessToday(); // Toronto YYYY-MM-DD — see docs/specs/no-past-alerts.md
  const entityUuid = workTrackerUuid ?? "__none__";

  const userQuery = useMemo(
    () =>
      db
        .selectFrom("Users as u")
        .select(["u.id as userUuid"])
        .where("u.clerk_user_id", "=", clerkUserId)
        .limit(1)
        .compile(),
    [clerkUserId],
  );

  const { data: userData } = useTypedQuery(userQuery, expect<UserRow>());
  const userUuid = userData?.[0]?.userUuid ?? "__no_user__";

  const alertsQuery = useMemo(
    () =>
      db
        .selectFrom("UserAlerts as ua")
        .innerJoin("Alerts as a", "a.id", "ua.alert_uuid")
        .leftJoin("WorkTrackers as wt", "wt.id", "a.entity_uuid")
        .select([
          "wt.date as entityDate",
          "ua.id as userAlertId",
          "a.id as alertId",
          "a.entity_uuid as entityUuid",
          "a.entity_type as entityType",
          "a.entity_description as entityDescription",
          "a.title as title",
          "a.message as message",
          "ua.dismissed as dismissed",
          "ua.dismissed_until as dismissedUntil",
          "ua.created_at as createdAt",
        ])
        .where("ua.user_uuid", "=", userUuid)
        .where("a.entity_uuid", "=", entityUuid)
        .where("a.entity_type", "=", "work_tracker")
        .orderBy("ua.created_at", "desc")
        .compile(),
    [userUuid, entityUuid],
  );

  const { data: rawAlerts = [] } = useTypedQuery(alertsQuery, expect<WorkTrackerAlertRow>());
  const allAlerts = hidePastAlerts(rawAlerts, today);

  const activeAlerts = allAlerts.filter(
    (a) => !a.dismissed || (a.dismissedUntil !== null && a.dismissedUntil <= today),
  );

  const dismissedAlerts = allAlerts.filter(
    (a) => !!a.dismissed && (a.dismissedUntil === null || a.dismissedUntil > today),
  );

  async function dismiss(userAlertId: string) {
    await typedExecute(
      db
        .updateTable("UserAlerts")
        .set({ dismissed: 1, dismissed_until: null } as any)
        .where("id", "=", userAlertId)
        .compile(),
    );
  }

  async function remindLater(userAlertId: string, date: string) {
    await typedExecute(
      db
        .updateTable("UserAlerts")
        .set({ dismissed: 1, dismissed_until: date } as any)
        .where("id", "=", userAlertId)
        .compile(),
    );
  }

  async function undismiss(userAlertId: string) {
    await typedExecute(
      db
        .updateTable("UserAlerts")
        .set({ dismissed: 0, dismissed_until: null } as any)
        .where("id", "=", userAlertId)
        .compile(),
    );
  }

  return {
    activeAlerts,
    dismissedAlerts,
    activeCount: activeAlerts.length,
    dismiss,
    remindLater,
    undismiss,
  };
}
