import { writeRepairsUrlState, type RepairsUrlState } from "./repairPageState";

/**
 * Which repairs of the Repairs table are open. It lives in React, not in the address, and it
 * belongs to the state of the list in the address: any change of that state closes every repair.
 * docs/specs/repairs-06-expanded-row.md §2.5 and §3 (D81, D82).
 */

/** The open repairs, and the list state (`key`) they were opened under. */
export type Expansion = { key: string; ids: readonly string[] };

export const NO_EXPANSION: Expansion = { key: "", ids: [] };

/**
 * The query string of the owned parameters of the address, `page` included: the tab, the page, the
 * page size, the search, the four filters, the sort and Show Deleted (D82). Parameters the page
 * does not own are not in it, so they cannot close a row.
 */
export function repairsListKey(state: RepairsUrlState): string {
  return writeRepairsUrlState(state, new URLSearchParams()).toString();
}

/** The open repairs for `key`; empty when the expansion was made under another key. */
export function openRepairIds(expansion: Expansion, key: string): ReadonlySet<string> {
  return new Set(expansion.key === key ? expansion.ids : []);
}

/** Opens a closed repair or closes an open one under `key`; another key starts from empty. */
export function toggleRepair(expansion: Expansion, key: string, repairId: string): Expansion {
  const current = expansion.key === key ? expansion.ids : [];
  const ids = current.includes(repairId)
    ? current.filter((id) => id !== repairId)
    : [...current, repairId];
  return { key, ids };
}

/**
 * Forgets the open repairs once the key has changed, so that coming back to the first view does not
 * bring them back. The page calls it while it renders. An expansion that holds nothing is returned
 * as it is, so that rendering cannot loop.
 */
export function reconcileExpansion(expansion: Expansion, key: string): Expansion {
  if (expansion.key === key || expansion.ids.length === 0) return expansion;
  return NO_EXPANSION;
}
