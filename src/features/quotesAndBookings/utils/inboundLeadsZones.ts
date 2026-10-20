/**
 * The zones with no active account manager: nobody works them, so their requests have no owner by
 * zone (today, Zone 6). Worked out from the data, so assigning someone to a zone takes it off this
 * list by itself.
 */
export function unstaffedZoneIds(allZoneIds: string[], staffedZoneIds: string[]): string[] {
  const staffed = new Set(staffedZoneIds);
  return allZoneIds.filter((id) => !staffed.has(id));
}
