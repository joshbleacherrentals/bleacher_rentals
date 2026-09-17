"use client";

import { useEffect, useMemo } from "react";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { usePsEventsQuery } from "@/features/dashboard/db/hooks/powersync/usePsEvents";
import { usePsBleacherEventsQuery } from "@/features/dashboard/db/hooks/powersync/usePsBleacherEvents";
import { usePsBleachersQuery } from "@/features/dashboard/db/hooks/powersync/usePsBleachers";
import { alertDefinitions } from "@/features/alerts/registry";
import type { AlertPayload, InMemoryAlertContext } from "@/features/alerts/types";
import { calculateBestHue } from "@/features/dashboard/functions";
import { mergeAlertFamily, sameAlertList } from "./alertFamilies";

/**
 * Computes the event form's in-memory alerts from live PowerSync data.
 *
 * Replaces `updateCurrentEventAlerts`, which read four Zustand stores through
 * `getState()` and was re-triggered by hand from each store's setter and from a
 * `useCurrentEventStore.subscribe`. Those stores mirrored whole tables over
 * Supabase REST, which silently truncated at 1000 rows — `schedulingConflict`
 * was deciding on 37% of `BleacherEvents`.
 *
 * Shaped after `useEventFormTransportationAlerts`, which already did this for
 * the transportation family. The two together own the whole alert list; see
 * `alertFamilies` for how they stay out of each other's way.
 */

/** Titles this hook owns, derived from the definitions so the two cannot drift. */
const OWNED_TITLES = alertDefinitions.filter((d) => d.evaluateInMemory).map((d) => d.title);

export function useEventFormAlerts() {
  const event = useCurrentEventStore((s) => s);

  const eventsQuery = usePsEventsQuery();
  const bleacherEventsQuery = usePsBleacherEventsQuery();
  const bleachersQuery = usePsBleachersQuery();

  // An empty result reads as "nothing wrong with this event", so a list that has
  // simply not arrived yet must not be allowed to produce that verdict. On a
  // first-ever sync every table is empty for a while.
  const isLoading =
    eventsQuery.isLoading || bleacherEventsQuery.isLoading || bleachersQuery.isLoading;

  const allEvents = eventsQuery.data ?? [];
  const allBleacherEvents = bleacherEventsQuery.data ?? [];
  const allBleachers = bleachersQuery.data ?? [];

  const computed = useMemo<AlertPayload[] | null>(() => {
    if (isLoading) return null;
    if (!event.eventStart || !event.eventEnd) return null;

    const context: InMemoryAlertContext = {
      event,
      allEvents,
      allBleacherEvents,
      allBleachers,
    };

    return alertDefinitions
      .filter((d) => d.evaluateInMemory)
      .flatMap((d) => d.evaluateInMemory!(context));
  }, [isLoading, event, allEvents, allBleacherEvents, allBleachers]);

  useEffect(() => {
    if (computed === null) return;

    const store = useCurrentEventStore.getState();
    const merged = mergeAlertFamily(store.alerts, OWNED_TITLES, computed);
    if (!sameAlertList(store.alerts, merged)) store.setField("alerts", merged);
  }, [computed]);

  // The colour picker reads the same event list and used to ride along in the
  // same `useCurrentEventStore.subscribe` callback. Kept together so there is
  // one place that turns "the event changed" into derived form state.
  useEffect(() => {
    if (isLoading) return;
    if (!event.eventStart || !event.eventEnd) return;
    if (event.hslHue !== null) return;

    const newHue = calculateBestHue(event, allEvents);
    if (newHue !== null) useCurrentEventStore.getState().setField("hslHue", newHue);
  }, [isLoading, event, allEvents]);
}
