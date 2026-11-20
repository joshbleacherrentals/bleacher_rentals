"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useLogisticsPlans } from "@/features/scheduleValidator/hooks/useLogisticsPlans";
import { useEventsStartingInWeek } from "@/features/scheduleValidator/hooks/useEventsStartingInWeek";
import {
  useEventsBleachers,
  type EventBleachers,
} from "@/features/scheduleValidator/hooks/useEventsBleachers";
import { useBleacherBookings } from "@/features/scheduleValidator/hooks/useBleacherBookings";
import { useDriverWorkload } from "@/features/scheduleValidator/hooks/useDriverWorkload";
import { useDriverAvailability } from "@/features/scheduleValidator/hooks/useDriverAvailability";
import {
  findOverbookedBleachers,
  type OverbookedBleacher,
} from "@/features/scheduleValidator/utils/overbooked";
import type { WeekEvent } from "@/features/scheduleValidator/utils/eventsStartingInWeek";
import type { DriverWorkload } from "@/features/scheduleValidator/utils/driverWorkload";
import type { DriverAvailability } from "@/features/scheduleValidator/utils/driverAvailability";
import { buildDeliveryList, type EventDeliveries } from "../utils/deliveryList";
import {
  summarizeDriverAvailability,
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

  const weekEvents = useEventsStartingInWeek(weekStart);
  const eventIds = useMemo(() => weekEvents.events.map((e) => e.id), [weekEvents.events]);
  const eventsBleachers = useEventsBleachers(eventIds);

  const bookings = useBleacherBookings(weekStart);
  const overbooked = useMemo(
    () => findOverbookedBleachers(bookings.bookings, weekStart),
    [bookings.bookings, weekStart],
  );

  const workload = useDriverWorkload(weekStart);
  const availability = useDriverAvailability(weekStart);

  const value = useMemo<Checks>(() => {
    const requirementsLoading = weekEvents.isLoading || eventsBleachers.isLoading;
    return {
      eventFulfilment: { deliveries, isLoading: logistics.isLoading },
      eventBleacherRequirements: {
        events: weekEvents.events,
        byEvent: eventsBleachers.byEvent,
        isLoading: requirementsLoading,
      },
      overbookedBleachers: { overbooked, isLoading: bookings.isLoading },
      driverWorkload: { drivers: workload.drivers, isLoading: workload.isLoading },
      driverAvailability: { drivers: availability.drivers, isLoading: availability.isLoading },
      statuses: {
        "event-fulfilment": {
          isLoading: !!zoneId && logistics.isLoading,
          summary: zoneId ? summarizeEventFulfilment(deliveries) : null,
        },
        "event-bleacher-requirements": {
          isLoading: requirementsLoading,
          summary: summarizeEventBleacherRequirements(eventIds, eventsBleachers.byEvent),
        },
        "overbooked-bleachers": {
          isLoading: bookings.isLoading,
          summary: summarizeOverbookedBleachers(bookings.bookings, overbooked),
        },
        "driver-workload": {
          isLoading: workload.isLoading,
          summary: summarizeDriverWorkload(workload.drivers),
        },
        "driver-availability": {
          isLoading: availability.isLoading,
          summary: summarizeDriverAvailability(availability.drivers),
        },
      },
    };
  }, [
    zoneId,
    deliveries,
    logistics.isLoading,
    weekEvents.events,
    weekEvents.isLoading,
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
  ]);

  return <ChecksContext.Provider value={value}>{children}</ChecksContext.Provider>;
}

/** The checks run by the surrounding ChecksProvider (the Auto Work Trackers shell). */
export function useChecks(): Checks {
  const checks = useContext(ChecksContext);
  if (!checks) throw new Error("useChecks must be used inside ChecksProvider");
  return checks;
}
