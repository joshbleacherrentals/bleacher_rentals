"use client";

import { useEffect, useMemo } from "react";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { usePsAddresses } from "@/features/dashboard/db/hooks/powersync/usePsAddresses";
import { usePsBleachers } from "@/features/dashboard/db/hooks/powersync/usePsBleachers";
import { usePsBleacherEvents } from "@/features/dashboard/db/hooks/powersync/usePsBleacherEvents";
import { usePsWorkTrackers } from "@/features/dashboard/db/hooks/powersync/usePsWorkTrackers";
import { usePsEvents } from "@/features/dashboard/db/hooks/powersync/usePsEvents";
import type { AlertPayload } from "@/features/alerts/types";
import { TRANSPORTATION_ALERT_TITLES, mergeAlertFamily, sameAlertList } from "./alertFamilies";
import { isPastBusinessDate } from "@/features/alerts/util/pastAlerts";

/**
 * Reactively computes "No Transportation" alerts for the event config form using
 * live PowerSync data. Works for both new (unsaved) events and existing ones.
 * Fires as soon as the address field changes (even before saving).
 *
 * This replaces bleacherTransportation.evaluateInMemory which used deprecated
 * Zustand stores and required an addressUuid (unavailable for new events).
 */
export function useEventFormTransportationAlerts() {
  const eventStreet = useCurrentEventStore((s) => s.addressData?.address ?? "");
  const bleacherUuids = useCurrentEventStore((s) => s.bleacherUuids);
  const eventStart = useCurrentEventStore((s) => s.eventStart);
  const eventEnd = useCurrentEventStore((s) => s.eventEnd);
  const eventName = useCurrentEventStore((s) => s.eventName);
  const eventUuid = useCurrentEventStore((s) => s.eventUuid);

  const addresses = usePsAddresses();
  const bleachers = usePsBleachers();
  const bleacherEvents = usePsBleacherEvents();
  const workTrackers = usePsWorkTrackers();
  const events = usePsEvents();

  const transportAlerts = useMemo<AlertPayload[]>(() => {
    if (!eventStreet || !eventStart || bleacherUuids.length === 0) return [];
    // An event that has ended shows no alerts — see docs/specs/no-past-alerts.md.
    if (isPastBusinessDate(eventEnd)) return [];

    const result: AlertPayload[] = [];

    for (const bleacherUuid of bleacherUuids) {
      // Find last known location for this bleacher before eventStart
      // Check past booked events
      const linkedEventUuids = bleacherEvents
        .filter((be) => be.bleacher_uuid === bleacherUuid)
        .map((be) => be.event_uuid);

      let eventLocation: { addressUuid: string; lastDate: string } | null = null;
      for (const ev of events) {
        if (!linkedEventUuids.includes(ev.id)) continue;
        if (ev.event_status !== "booked") continue;
        if (!ev.address_uuid || !ev.event_end) continue;
        if (ev.deleted) continue;
        if (ev.event_end >= eventStart) continue;
        if (!eventLocation || ev.event_end > eventLocation.lastDate) {
          eventLocation = { addressUuid: ev.address_uuid, lastDate: ev.event_end };
        }
      }

      // Check work tracker drop-off addresses
      let wtLocation: { addressUuid: string; lastDate: string } | null = null;
      for (const wt of workTrackers) {
        if (wt.bleacher_uuid !== bleacherUuid) continue;
        if (!wt.dropoff_address_uuid || !wt.date) continue;
        if (wt.date >= eventStart) continue;
        if (!wtLocation || wt.date > wtLocation.lastDate) {
          wtLocation = { addressUuid: wt.dropoff_address_uuid, lastDate: wt.date };
        }
      }

      const lastLocation = !eventLocation
        ? wtLocation
        : !wtLocation
          ? eventLocation
          : eventLocation.lastDate >= wtLocation.lastDate
            ? eventLocation
            : wtLocation;

      if (!lastLocation) continue;

      const lastAddr = addresses.find((a) => a.id === lastLocation.addressUuid);
      const lastStreet = lastAddr?.street ?? "";
      if (!lastStreet || lastStreet === eventStreet) continue;

      const bleacher = bleachers.find((b) => b.id === bleacherUuid);
      const bleacherNum = bleacher?.bleacher_number;
      const desc = [bleacherNum != null ? `Bleacher #${bleacherNum}` : null, eventName]
        .filter(Boolean)
        .join(" — ");

      result.push({
        entity_uuid: eventUuid,
        entity_type: "bleacher_event",
        title: "No Transportation",
        message: `${desc}: Last known location: ${lastStreet}. Event location: ${eventStreet}.`,
        entity_description: desc || null,
      });
    }

    return result;
  }, [
    eventStreet,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(bleacherUuids),
    eventStart,
    eventEnd,
    eventName,
    eventUuid,
    addresses,
    bleachers,
    bleacherEvents,
    workTrackers,
    events,
  ]);

  useEffect(() => {
    const store = useCurrentEventStore.getState();
    const merged = mergeAlertFamily(store.alerts, TRANSPORTATION_ALERT_TITLES, transportAlerts);
    if (!sameAlertList(store.alerts, merged)) store.setField("alerts", merged);
  }, [transportAlerts]);
}
