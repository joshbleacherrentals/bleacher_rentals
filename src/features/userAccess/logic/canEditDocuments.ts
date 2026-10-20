/**
 * Assets > Documents (the BlueBook table, shown to drivers in the mobile app).
 *
 * The database is the real gate (see 20261020120000_maintainer_asset_documents.sql); these only
 * decide whether the controls show. Spec: docs/specs/maintainer-asset-documents.md
 */

/** The Add Document button. Account managers can edit but have never had an add button. */
export function canAddDocuments(params: { isAdmin: boolean; isMaintainer: boolean }): boolean {
  return params.isAdmin || params.isMaintainer;
}

/**
 * The Delete button. A maintainer edits and adds but cannot delete — a delete here is permanent and
 * the document disappears from the driver app. Account managers keep it: rbac_delete already lets
 * them, and the button was already theirs.
 */
export function canDeleteDocuments(params: {
  isAdmin: boolean;
  isAccountManager: boolean;
}): boolean {
  return params.isAdmin || params.isAccountManager;
}
