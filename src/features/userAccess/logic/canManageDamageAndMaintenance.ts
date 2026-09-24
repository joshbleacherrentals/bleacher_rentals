/**
 * Who gets the edit / delete / restore controls on the Damage Reports and Repairs pages.
 *
 * Deliberately not `canCreateUser`: that flag also gates inviting team members, and a maintainer
 * must not gain that. The database is the real gate (see 20260923140000_maintainer_damage_maintenance.sql);
 * this only decides whether the buttons are shown.
 */
export function canManageDamageAndMaintenance(params: {
  isAdmin: boolean;
  isMaintainer: boolean;
}): boolean {
  return params.isAdmin || params.isMaintainer;
}
