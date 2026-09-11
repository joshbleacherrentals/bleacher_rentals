import { toast } from "sonner";
import React from "react";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import {
  AddressData,
  CurrentEventState,
  CurrentEventStore,
  useCurrentEventStore,
} from "../eventConfiguration/state/useCurrentEventStore";
import { useEventsStore } from "@/state/eventsStore";
import { useBleacherEventsStore } from "@/state/bleacherEventStore";
import { useBleachersStore } from "@/state/bleachersStore";
import { UserResource } from "@clerk/types";
import { PROVINCES, ROW_OPTIONS, STATES } from "@/types/Constants";
import { Tables } from "../../../database.types";
import { DashboardBleacher } from "../dashboard/types";
import { alertDefinitions } from "@/features/alerts/registry";
import { InMemoryAlertContext } from "@/features/alerts/types";
import { useWorkTrackersStore } from "@/state/workTrackersStore";
import { useAddressesStore } from "@/state/addressesStore";

export function checkEventFormRules(
  createEventPayload: CurrentEventStore,
  user: UserResource | null,
): boolean {
  // check if all required fields are filled in
  let missingFields = [];
  // const error = isUserPermitted(createEventPayload.addressData?.state ?? "", user);
  // if (error) {
  //   missingFields.push(error);
  // }
  if (createEventPayload.eventName == "") {
    missingFields.push("Missing: Event Name");
  }
  // "Venue" here just means an address is set — via a linked Venue or a
  // manually-typed one ("detached", see docs/specs/venue-history.md §2.3).
  // Only the label changed; addressData is populated either way.
  if (createEventPayload.addressData == null || createEventPayload.addressData.address == "") {
    missingFields.push("Missing: Venue");
  }
  if (!createEventPayload.eventStart || createEventPayload.eventStart == "") {
    missingFields.push("Missing: Event Start");
  }
  if (!createEventPayload.eventEnd || createEventPayload.eventEnd == "") {
    missingFields.push("Missing: Event End");
  }
  // if (!createEventPayload.setupStart || createEventPayload.setupStart == "") {
  //   if (!createEventPayload.sameDaySetup) {
  //     missingFields.push("Missing: Setup Start");
  //   }
  // }
  // if (!createEventPayload.teardownEnd || createEventPayload.teardownEnd == "") {
  //   if (!createEventPayload.sameDayTeardown) {
  //     missingFields.push("Missing: Teardown End");
  //   }
  // }

  // Lenient Conditions
  // if (createEventPayload.lenient) {
  //   if (!createEventPayload.seats || createEventPayload.seats == 0) {
  //     missingFields.push("Need at least one seat");
  //   }
  // } else {
  //   const totalBleachers =
  //     (createEventPayload.sevenRow || 0) +
  //     (createEventPayload.tenRow || 0) +
  //     (createEventPayload.fifteenRow || 0);

  //   if (totalBleachers == 0) {
  //     missingFields.push("Select at least one bleacher");
  //   }
  // }
  if (createEventPayload.bleacherUuids.length === 0) {
    missingFields.push("Select at least one bleacher");
  }
  if (missingFields.length > 0) {
    toast.custom(
      (t) =>
        React.createElement(ErrorToast, {
          id: t,
          lines: missingFields,
        }),
      {
        duration: 10000, // 20 seconds
      },
    );
    return false;
  } else {
    return true;
  }
}

export const calculateNumDays = (start: string, end: string): number => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return days;
};

export function calculateBestHue(
  currentEvent: CurrentEventStore,
  events: Tables<"Events">[],
): number | null {
  if (!currentEvent.eventStart || !currentEvent.eventEnd) return null;

  const currentStart = new Date(currentEvent.eventStart);
  const currentEnd = new Date(currentEvent.eventEnd);

  // Define the window to search around the current event
  const windowStart = new Date(currentStart);
  windowStart.setMonth(currentStart.getMonth() - 2);

  const windowEnd = new Date(currentEnd);
  windowEnd.setMonth(currentEnd.getMonth() + 2);

  const eventsWithinRange = events.filter((event) => {
    const eventStart = new Date(event.event_start);
    const eventEnd = new Date(event.event_end);

    // Check if the event overlaps with the 2-month window
    return eventStart <= windowEnd && eventEnd >= windowStart;
  });

  // console.log(
  //   "eventsWithinRange",
  //   eventsWithinRange.map((e) => e.event_name)
  // );

  const existingHues = eventsWithinRange
    .map((event) => event.hsl_hue)
    .filter((hue) => hue !== null);

  // Exclude hues 40-70 because they look ugly with the yellow setup and teardown blocks
  const forbiddenHues = Array.from({ length: 31 }, (_, i) => i + 40); // [40, 41, ..., 70]
  // console.log("forbiddenHues", forbiddenHues);
  existingHues.push(...forbiddenHues);

  if (existingHues.length === 0) return Math.floor(Math.random() * 360);

  // Normalize and sort hues
  const sorted = [...new Set(existingHues.map((h) => ((h % 360) + 360) % 360))].sort(
    (a, b) => a - b,
  );
  // console.log("sorted", sorted);

  let maxGap = 0;
  let newHue = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const next = sorted[(i + 1) % sorted.length]; // wrap around
    const gap = (next > current ? next : next + 360) - current;
    // console.log(`${i} current-${current}, next-${next}, gap ${gap}`);

    if (gap > maxGap) {
      maxGap = gap;
      newHue = (gap / 2 + current) % 360;
    }
  }
  // console.log("maxGap ", maxGap);
  // console.log("newHue (unrounded)", newHue);

  return Math.round(newHue);
}

export function updateCurrentEventAlerts() {
  const state = useCurrentEventStore.getState();
  const events = useEventsStore.getState().events;
  const bleacherEvents = useBleacherEventsStore.getState().bleacherEvents;
  const bleachers = useBleachersStore.getState().bleachers;

  // Only calculate if necessary
  if (!state.eventStart || !state.eventEnd) return;

  const oldAlerts = state.alerts;
  const workTrackers = useWorkTrackersStore.getState().workTrackers;
  const addresses = useAddressesStore.getState().addresses;
  const context: InMemoryAlertContext = {
    event: state,
    allEvents: events,
    allBleacherEvents: bleacherEvents,
    allWorkTrackers: workTrackers,
    allBleachers: bleachers,
    allAddresses: addresses,
  };
  const computedAlerts = alertDefinitions
    .filter((d) => d.evaluateInMemory)
    .flatMap((d) => d.evaluateInMemory!(context));

  // Preserve transportation alerts set by useEventFormTransportationAlerts (PS-driven hook)
  const existingTransportAlerts = oldAlerts.filter((a) => a.title === "No Transportation");
  const newAlerts = [...computedAlerts, ...existingTransportAlerts];

  const oldMessages = oldAlerts.map((a) => a.message);
  const newMessages = newAlerts.map((a) => a.message);
  const isDifferent =
    oldMessages.length !== newMessages.length ||
    oldMessages.some((m, i) => m !== newMessages[i]) ||
    oldAlerts.some((a, i) => a.entity_description !== newAlerts[i]?.entity_description);

  if (isDifferent) {
    useCurrentEventStore.getState().setField("alerts", newAlerts);
  }
}

// export function isUserPermitted(stateProv: string, user: UserResource | null): string | null {
//   const users = useUsersStore.getState().users;
//   const currentUser = users.find((u) => u.clerk_user_id === user?.id);
//   const errorMessages = [
//     "Error: Cannot Find Home Base",
//     "Error: Cannot Find User",
//     "You are not permitted to edit events in this region.",
//   ];

//   if (!currentUser) {
//     return errorMessages[1];
//   }

//   if (currentUser.role === 2) return null; // Admin can access all events

//   const userHomeBases = useUserHomeBasesStore.getState().userHomeBases;

//   let eventHomeBaseId: number | null = null;
//   try {
//     eventHomeBaseId = getHomeBaseIdByName(stateProv);
//     if (!eventHomeBaseId) return errorMessages[0];
//   } catch (error) {
//     return errorMessages[0];
//   }

//   // Check if any of the user's home base assignments match the eventHomeBaseId
//   const isPermitted = userHomeBases.some(
//     (uhb) => uhb.user_id === currentUser.user_id && uhb.home_base_id === eventHomeBaseId
//   );

//   if (!isPermitted) {
//     return errorMessages[2];
//   }
//   return null;
// }

// should return something like this:
//   return [
//     { value: 7, label: "7" },
//     { value: 8, label: "8" },
//     etc...
//   ];
export function getRowOptions() {
  return ROW_OPTIONS.map((value) => ({
    value,
    label: value.toString(),
  }));
}

export function getStateProvOptions() {
  const allOptions = [...STATES, ...PROVINCES];
  return allOptions.map((value, index) => ({
    value: index,
    label: value,
  }));
}

export function getTodayLocation(bleacher: DashboardBleacher): AddressData | null {
  const today = new Date();

  const pastOrTodayEvents = bleacher.events.filter((e) => {
    const start = new Date(e.eventStart);
    return start <= today && e.addressData?.address;
  });

  if (pastOrTodayEvents.length === 0) return null;

  // Find the event with the most recent start date that is not after today
  const closestEvent = pastOrTodayEvents.reduce((latest, current) => {
    const latestDate = new Date(latest.eventStart);
    const currentDate = new Date(current.eventStart);
    return currentDate > latestDate ? current : latest;
  });

  return closestEvent.addressData;
}
