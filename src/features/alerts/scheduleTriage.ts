"use client";

import { triage } from "./triage";

type TriageTable = "Events" | "Events_deleted" | "WorkTrackers" | "WorkTrackers_deleted";

/**
 * Starts an alert cascade without making the user wait for it.
 *
 * Saving or moving a work tracker used to await the cascade, so a 66ms DB write
 * could sit behind 14s of alert re-evaluation. The cascade is advisory work:
 * nothing the user sees next depends on it, and `runCascade` now collapses
 * bursts so letting go of the spinner no longer lets cascades pile up.
 *
 * Trade-off, accepted deliberately: a cascade that is not awaited may not finish
 * if the tab is closed mid-run. The alerts it would have written then stay stale
 * until the nightly cron (`/api/cron/alerts`), which re-derives every alert from
 * scratch. Nothing is left half-written — the cascade commits as one
 * transaction — so the cost is bounded staleness, never an inconsistent row.
 * Blocking a tab close to finish advisory work would be the worse trade.
 *
 * The triage module is imported statically. Resolving it lazily cost a measured
 * 890ms on the first save of a session — against 93ms for the triage itself —
 * and it is pulled into the dashboard bundle anyway the moment anyone saves.
 */
export function scheduleTriage(
  table: TriageTable,
  row: { id: string; [key: string]: unknown },
): void {
  triage(table, row as { id: string; [key: string]: any }).catch((e) => {
    console.error("[alerts] cascade failed", table, row.id, e);
  });
}
