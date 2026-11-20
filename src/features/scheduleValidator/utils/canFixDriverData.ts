/**
 * Who may fix a driver's data from Driver Data: an admin, for any zone; an account manager, only in
 * a zone they manage (every driver listed is in the selected zone, so they share it). The same rule
 * the database applies to editing a driver (drivers_update), so a save is never rejected after the
 * fact. Pure.
 */
export function canFixDriverData(input: { isAdmin: boolean; managesZone: boolean }): boolean {
  return input.isAdmin || input.managesZone;
}
