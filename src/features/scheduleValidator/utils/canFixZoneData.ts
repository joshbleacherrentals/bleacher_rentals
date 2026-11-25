/**
 * Who may fix a zone's data from Driver Data or Event Data: an admin, for any zone; an account manager, only in
 * a zone they manage (every driver or event listed belongs to the selected zone). The same rule
 * the database applies to editing a driver (drivers_update), so a save is never rejected after the
 * fact. Pure.
 */
export function canFixZoneData(input: { isAdmin: boolean; managesZone: boolean }): boolean {
  return input.isAdmin || input.managesZone;
}
