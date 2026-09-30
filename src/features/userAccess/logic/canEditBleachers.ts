/**
 * Who gets the Add Bleacher button and the editable form on Assets > Bleachers.
 *
 * Account managers and viewers stay read-only there. The database is the real gate (see
 * 20260930120000_maintainer_edit_bleachers.sql); this only decides whether the controls show.
 */
export function canEditBleachers(params: { isAdmin: boolean; isMaintainer: boolean }): boolean {
  return params.isAdmin || params.isMaintainer;
}
