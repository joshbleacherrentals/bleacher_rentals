"use client";

/**
 * Acknowledgements, on the manager's side.
 *
 * Spec: br_driver/docs/specs/damage-report-dedupe.md
 *
 * Drivers no longer file a second report about damage that is already open —
 * they confirm the existing one. Without showing that here, the change reads
 * as "fewer reports arrive", which is indistinguishable from drivers quietly
 * giving up on reporting. What a manager is owed instead is the stronger
 * signal: three people have seen this, most recently on the 8th, and it is
 * still broken.
 */

import { useMemo } from "react";
import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type AcknowledgementRow = {
  id: string;
  damage_report_uuid: string | null;
  created_at: string | null;
  inspection_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type AcknowledgementEntry = {
  id: string;
  name: string;
  at: string | null;
  /** An inspection ack was made while working the trip; standalone was not. */
  source: "inspection" | "standalone";
};

export type AcknowledgementSummary = {
  count: number;
  latestAt: string | null;
  entries: AcknowledgementEntry[];
};

export function buildAcknowledgementsQuery(
  damageReportIds: string[],
): CompiledQuery<AcknowledgementRow> {
  return db
    .selectFrom("DamageReportAcknowledgements as a")
    .leftJoin("Users as u", "u.id", "a.acknowledged_by_user_uuid")
    .select([
      "a.id",
      "a.damage_report_uuid",
      "a.created_at",
      "a.inspection_uuid",
      "u.first_name as first_name",
      "u.last_name as last_name",
    ])
    .where("a.damage_report_uuid", "in", damageReportIds)
    .where("a.deleted", "=", 0)
    .orderBy("a.created_at", "desc")
    .compile() as unknown as CompiledQuery<AcknowledgementRow>;
}

/**
 * Grouped by report, newest first.
 *
 * A driver with no name on their user row still counts — the confirmation is
 * the fact that matters, and "A driver" reads better than a blank.
 */
export function summariseAcknowledgements(
  rows: AcknowledgementRow[],
): Record<string, AcknowledgementSummary> {
  const summary: Record<string, AcknowledgementSummary> = {};

  const sorted = [...rows].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  for (const row of sorted) {
    if (!row.damage_report_uuid) continue;

    const name = [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "A driver";

    const existing = (summary[row.damage_report_uuid] ??= {
      count: 0,
      latestAt: null,
      entries: [],
    });

    existing.count += 1;
    existing.latestAt ??= row.created_at;
    existing.entries.push({
      id: row.id,
      name,
      at: row.created_at,
      source: row.inspection_uuid ? "inspection" : "standalone",
    });
  }

  return summary;
}

/** Reactive acknowledgements for the reports currently on screen. */
export function useAcknowledgements(damageReportIds: string[]): {
  byReport: Record<string, AcknowledgementSummary>;
} {
  // Ids come from a rendered list, so a fresh array identity every render is
  // the norm; the join is what keeps the query stable.
  const key = damageReportIds.join(",");

  // A query that matches nothing rather than no query at all: this hook runs
  // before a report is selected, and `useTypedQuery` has no "not ready" state.
  const compiled = useMemo(
    () => buildAcknowledgementsQuery(key ? key.split(",") : ["__none__"]),
    [key],
  );

  const { data } = useTypedQuery(compiled, expect<AcknowledgementRow>());

  return useMemo(() => ({ byReport: summariseAcknowledgements(data ?? []) }), [data]);
}
