import type { AlertPayload } from "@/features/alerts/types";

/**
 * Two hooks write alerts into `useCurrentEventStore.alerts`, and neither may
 * clobber the other.
 *
 * `useEventFormTransportationAlerts` owns the transportation family;
 * `useEventFormAlerts` owns everything the in-memory alert definitions produce.
 * Each recomputes only its own titles, so an empty result from one hook means
 * "my family is clear", never "clear the list".
 *
 * Splitting by title is what the two hooks already did informally; this makes it
 * one rule both sides call, and makes it testable on its own.
 */
export const TRANSPORTATION_ALERT_TITLES = ["No Transportation"];

/** Replaces every alert whose title the caller owns, preserving the rest in order. */
export function mergeAlertFamily(
  existing: AlertPayload[],
  ownedTitles: string[],
  computed: AlertPayload[],
): AlertPayload[] {
  const owned = new Set(ownedTitles);
  return [...existing.filter((alert) => !owned.has(alert.title)), ...computed];
}

/**
 * Whether writing `next` would be a no-op.
 *
 * The store is subscribed to by the form and by the PixiJS layer, so a
 * same-content write is a wasted render storm. Order counts: the list is
 * rendered in order, so a reshuffle is a real change.
 */
export function sameAlertList(current: AlertPayload[], next: AlertPayload[]): boolean {
  if (current.length !== next.length) return false;

  return current.every(
    (alert, index) =>
      alert.title === next[index].title &&
      alert.message === next[index].message &&
      alert.entity_description === next[index].entity_description,
  );
}
