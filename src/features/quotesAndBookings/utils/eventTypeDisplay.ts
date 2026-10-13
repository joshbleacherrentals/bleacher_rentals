/**
 * What the Contract tab's read-only "Event Type" line says.
 *
 * `null` means "draw nothing yet": the name is still being looked up, and showing "Unknown" for
 * a few milliseconds first would read as though the type were missing.
 */
export function eventTypeDisplay(input: {
  eventTypeUuid: string | null;
  name: string | null;
  isLoading: boolean;
}): string | null {
  if (!input.eventTypeUuid) return "Not set";
  if (input.isLoading) return null;
  return input.name?.trim() || "Unknown";
}
