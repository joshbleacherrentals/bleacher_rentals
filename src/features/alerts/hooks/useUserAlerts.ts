"use client";
import { useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery, typedExecute } from "@/lib/powersync/typedQuery";
import { businessToday, hidePastAlerts } from "../util/pastAlerts";
import { hideOutOfWindowTransportationAlerts } from "../util/transportationWindow";
import {
  buildUserAlertsQueries,
  mergeUserAlerts,
  type AlertPart,
  type BleacherEventPart,
  type EventDatesPart,
  type UserAlertPart,
  type WorkTrackerPart,
} from "../util/userAlertsData";

export type UserAlertRow = {
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
  /** The date that decides whether the alert's entity is past; null when not synced locally. */
  entityDate: string | null;
  /** The entity's start date, which bounds "No Transportation"; null when not synced locally. */
  entityStartDate: string | null;
};

// ─── user lookup ─────────────────────────────────────────────────────────────

type UserRow = { userUuid: string };

const NO_ALERTS: UserAlertRow[] = [];

export function useUserAlerts() {
  const { user } = useUser();
  const clerkUserId = user?.id ?? "__no_clerk_user__";
  const today = businessToday(); // Toronto YYYY-MM-DD — see docs/specs/no-past-alerts.md

  // 1. Resolve Users.id from clerk id
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

  // 2. The user's UserAlerts with their Alert and the entity's dates, ordered by reminder then
  //    created. Five small queries, one per table, joined in JS: one JOIN query returned thousands
  //    of wide rows and re-ran on every commit to any of its five tables. The merge returns the
  //    rows the JOIN returned, in the same order (docs/specs/slow-local-db-step1-split-watchers.md).
  const queries = useMemo(() => buildUserAlertsQueries(db, userUuid), [userUuid]);

  const userAlertsPart = useTypedQuery(queries.userAlerts, expect<UserAlertPart>());
  const alertsPart = useTypedQuery(queries.alerts, expect<AlertPart>());
  const bleacherEventsPart = useTypedQuery(queries.bleacherEvents, expect<BleacherEventPart>());
  const eventsPart = useTypedQuery(queries.events, expect<EventDatesPart>());
  const workTrackersPart = useTypedQuery(queries.workTrackers, expect<WorkTrackerPart>());

  // The list is empty until every part has loaded, and when any part fails, as it was while the
  // one query loaded or failed. A half-loaded set is never merged: an alert without its entity
  // date would show for a moment even when its event is already over.
  const parts = [userAlertsPart, alertsPart, bleacherEventsPart, eventsPart, workTrackersPart];
  const ready = parts.every((part) => !part.isLoading && !part.error);
  const rawAlerts = useMemo(
    () =>
      ready
        ? mergeUserAlerts({
            userAlerts: userAlertsPart.data ?? [],
            alerts: alertsPart.data ?? [],
            bleacherEvents: bleacherEventsPart.data ?? [],
            events: eventsPart.data ?? [],
            workTrackers: workTrackersPart.data ?? [],
          })
        : NO_ALERTS,
    [
      ready,
      userAlertsPart.data,
      alertsPart.data,
      bleacherEventsPart.data,
      eventsPart.data,
      workTrackersPart.data,
    ],
  );
  // Alerts about something already over are never shown, even before the daily cleanup runs.
  // "No Transportation" is narrower still: only events starting inside the booking window.
  const allAlerts = hideOutOfWindowTransportationAlerts(hidePastAlerts(rawAlerts, today));

  // "Active" = not dismissed, or reminder date has arrived
  const activeAlerts = allAlerts.filter(
    (a) => !a.dismissed || (a.dismissedUntil !== null && a.dismissedUntil <= today),
  );

  // "Dismissed" = dismissed=1 AND (dismissed_until IS NULL OR dismissed_until > today)
  const dismissedAlerts = allAlerts.filter(
    (a) => !!a.dismissed && (a.dismissedUntil === null || a.dismissedUntil > today),
  );

  const activeCount = activeAlerts.length;

  async function dismiss(userAlertId: string) {
    const compiled = db
      .updateTable("UserAlerts")
      .set({ dismissed: 1, dismissed_until: null } as any)
      .where("id", "=", userAlertId)
      .compile();
    await typedExecute(compiled);
  }

  async function remindLater(userAlertId: string, date: string) {
    const compiled = db
      .updateTable("UserAlerts")
      .set({ dismissed: 1, dismissed_until: date } as any)
      .where("id", "=", userAlertId)
      .compile();
    await typedExecute(compiled);
  }

  async function undismiss(userAlertId: string) {
    const compiled = db
      .updateTable("UserAlerts")
      .set({ dismissed: 0, dismissed_until: null } as any)
      .where("id", "=", userAlertId)
      .compile();
    await typedExecute(compiled);
  }

  return { activeAlerts, dismissedAlerts, activeCount, dismiss, remindLater, undismiss };
}
