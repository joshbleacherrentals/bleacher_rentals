"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogisticsPlans } from "@/features/scheduleValidator/hooks/useLogisticsPlans";
import {
  useEventsBleachers,
  type EventBleachers,
} from "@/features/scheduleValidator/hooks/useEventsBleachers";
import { useBleacherBookings } from "@/features/scheduleValidator/hooks/useBleacherBookings";
import { useDriverWorkload } from "@/features/scheduleValidator/hooks/useDriverWorkload";
import { useDriverAvailability } from "@/features/scheduleValidator/hooks/useDriverAvailability";
import { useDriverData } from "@/features/scheduleValidator/hooks/useDriverData";
import { useEventData } from "@/features/scheduleValidator/hooks/useEventData";
import { useBleacherMoves } from "@/features/scheduleValidator/hooks/useBleacherMoves";
import type { BleacherMove } from "@/features/scheduleValidator/utils/bleacherMoves";
import { eventDataRoles, type EventData } from "@/features/scheduleValidator/utils/eventData";
import {
  findOverbookedBleachers,
  type OverbookedBleacher,
} from "@/features/scheduleValidator/utils/overbooked";
import type { WeekEvent } from "@/features/scheduleValidator/utils/eventsStartingInWeek";
import type { DriverWorkload } from "@/features/scheduleValidator/utils/driverWorkload";
import type { DriverAvailability } from "@/features/scheduleValidator/utils/driverAvailability";
import type { DriverData } from "@/features/scheduleValidator/utils/driverData";
import { buildDeliveryList, type EventDeliveries } from "../utils/deliveryList";
import { zoneWeekEvents } from "../utils/zoneEvents";
import {
  summarizeDriverAvailability,
  summarizeDriverData,
  summarizeEventData,
  summarizeBleacherData,
  summarizeDriverWorkload,
  summarizeEventBleacherRequirements,
  summarizeEventFulfilment,
  summarizeOverbookedBleachers,
  type CheckSummary,
} from "../utils/checkSummaries";

/** A check's result for the nav: loading, or how many passed. Null summary: not run (no zone yet). */
export type CheckStatus = { isLoading: boolean; summary: CheckSummary | null };

type Checks = {
  eventFulfilment: { deliveries: EventDeliveries[]; isLoading: boolean };
  eventBleacherRequirements: {
    events: WeekEvent[];
    byEvent: Map<string, EventBleachers>;
    isLoading: boolean;
  };
  overbookedBleachers: { overbooked: OverbookedBleacher[]; isLoading: boolean };
  driverWorkload: { drivers: DriverWorkload[]; isLoading: boolean };
  driverAvailability: { drivers: DriverAvailability[]; isLoading: boolean };
  driverData: { drivers: DriverData[]; isLoading: boolean };
  eventData: { events: EventData[]; isLoading: boolean };
  bleacherData: { moves: BleacherMove[]; eventNames: Map<string, string>; isLoading: boolean };
  /** Keyed by page slug; a page with no entry (the Dashboard) is a view, not a check. */
  statuses: Record<string, CheckStatus>;
};

const ChecksContext = createContext<Checks | null>(null);

/**
 * Runs every Auto Work Trackers check once for the zone and week, so the side panel can show how
 * each came out and the open page reads the same results instead of querying again. All of it is
 * local (PowerSync): the queries run in its worker, only the tallying runs here.
 */
export function ChecksProvider({
  zoneId,
  weekStart,
  children,
}: {
  zoneId: string;
  weekStart: string;
  children: ReactNode;
}) {
  const logistics = useLogisticsPlans(weekStart, zoneId || undefined);
  const deliveries = useMemo(() => buildDeliveryList(logistics.events), [logistics.events]);

  // The zone's events are the ones with a bleacher from it, as on the Dashboard. Their match is then
  // checked against every bleacher selected on them, so one shared with another zone is not short.
  const requirementEvents = useMemo(
    () => (zoneId ? zoneWeekEvents(logistics.events) : []),
    [zoneId, logistics.events],
  );
  const eventIds = useMemo(() => requirementEvents.map((e) => e.id), [requirementEvents]);
  const eventsBleachers = useEventsBleachers(eventIds);

  // Event Data: the same events, plus the ones their bleachers are picked up from.
  const eventRoles = useMemo(
    () => (zoneId ? eventDataRoles(logistics.events) : new Map()),
    [zoneId, logistics.events],
  );
  const eventData = useEventData(eventRoles);
  const bleacherMoves = useBleacherMoves(zoneId, weekStart);

  const bookings = useBleacherBookings(zoneId, weekStart);
  const overbooked = useMemo(
    () => findOverbookedBleachers(bookings.bookings, weekStart),
    [bookings.bookings, weekStart],
  );

  const workload = useDriverWorkload(zoneId, weekStart);
  const availability = useDriverAvailability(zoneId, weekStart);
  const driverData = useDriverData(zoneId);

  const value = useMemo<Checks>(() => {
    const requirementsLoading = !!zoneId && (logistics.isLoading || eventsBleachers.isLoading);
    const eventDataLoading = !!zoneId && (logistics.isLoading || eventData.isLoading);
    return {
      eventFulfilment: { deliveries, isLoading: logistics.isLoading },
      eventBleacherRequirements: {
        events: requirementEvents,
        byEvent: eventsBleachers.byEvent,
        isLoading: requirementsLoading,
      },
      overbookedBleachers: { overbooked, isLoading: bookings.isLoading },
      driverWorkload: { drivers: workload.drivers, isLoading: workload.isLoading },
      driverAvailability: { drivers: availability.drivers, isLoading: availability.isLoading },
      driverData: { drivers: driverData.drivers, isLoading: driverData.isLoading },
      eventData: { events: eventData.events, isLoading: eventDataLoading },
      bleacherData: {
        moves: bleacherMoves.moves,
        eventNames: bleacherMoves.eventNames,
        isLoading: bleacherMoves.isLoading,
      },
      statuses: {
        "event-fulfilment": {
          isLoading: !!zoneId && logistics.isLoading,
          summary: zoneId ? summarizeEventFulfilment(deliveries) : null,
        },
        "event-bleacher-requirements": {
          isLoading: requirementsLoading,
          summary: zoneId
            ? summarizeEventBleacherRequirements(eventIds, eventsBleachers.byEvent)
            : null,
        },
        "event-data": {
          isLoading: eventDataLoading,
          summary: zoneId ? summarizeEventData(eventData.events) : null,
        },
        "overbooked-bleachers": {
          isLoading: !!zoneId && bookings.isLoading,
          summary: zoneId ? summarizeOverbookedBleachers(bookings.bookings, overbooked) : null,
        },
        "bleacher-data": {
          isLoading: bleacherMoves.isLoading,
          summary: zoneId ? summarizeBleacherData(bleacherMoves.moves) : null,
        },
        "driver-workload": {
          isLoading: !!zoneId && workload.isLoading,
          summary: zoneId ? summarizeDriverWorkload(workload.drivers) : null,
        },
        "driver-availability": {
          isLoading: !!zoneId && availability.isLoading,
          summary: zoneId ? summarizeDriverAvailability(availability.drivers) : null,
        },
        "driver-data": {
          isLoading: !!zoneId && driverData.isLoading,
          summary: zoneId ? summarizeDriverData(driverData.drivers) : null,
        },
      },
    };
  }, [
    zoneId,
    deliveries,
    logistics.isLoading,
    requirementEvents,
    eventIds,
    eventsBleachers.byEvent,
    eventsBleachers.isLoading,
    bookings.bookings,
    bookings.isLoading,
    overbooked,
    workload.drivers,
    workload.isLoading,
    availability.drivers,
    availability.isLoading,
    driverData.drivers,
    driverData.isLoading,
    eventData.events,
    eventData.isLoading,
    bleacherMoves.moves,
    bleacherMoves.eventNames,
    bleacherMoves.isLoading,
  ]);

  return <ChecksContext.Provider value={value}>{children}</ChecksContext.Provider>;
}

/** The checks run by the surrounding ChecksProvider (the Auto Work Trackers shell). */
/** The checks, or null outside a ChecksProvider (Proof of Delivery runs none). */
export function useChecksOrNull(): Checks | null {
  return useContext(ChecksContext);
}

export function useChecks(): Checks {
  const checks = useContext(ChecksContext);
  if (!checks) throw new Error("useChecks must be used inside ChecksProvider");
  return checks;
}
