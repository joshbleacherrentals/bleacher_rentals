"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import WorkTrackerModal from "@/features/workTrackers/components/WorkTrackerModal";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import type { Tables } from "../../../../database.types";
import { lastCheckQuery, weekProofsQuery, type WeekProofRow } from "../db/weekProofsQuery";
import {
  PROOF_LABEL,
  PROOF_ORDER,
  canCheckDeliveryNow,
  listStatus,
  proofCounts,
  sortWorstFirst,
  type ListStatus,
} from "../logic/proofList";
import { PROOF_RADIUS_TEXT } from "../logic/describeProof";
import type { DeliveryProofSummary } from "../server/runDeliveryProofs";

const BADGE: Record<ListStatus, string> = {
  not_found: "bg-red-100 text-red-800",
  no_gps: "bg-amber-100 text-amber-800",
  no_location: "bg-amber-100 text-amber-800",
  waiting: "bg-gray-100 text-gray-700",
  unchecked: "bg-gray-100 text-gray-500",
  verified: "bg-green-100 text-green-800",
};

const when = (ts: string | null) =>
  ts ? DateTime.fromISO(ts.replace(" ", "T")).toFormat("MMM d, h:mm a") : "—";
const distance = (m: number | null) =>
  m == null ? "—" : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
const driverName = (r: WeekProofRow) =>
  [r.driver_first, r.driver_last].filter(Boolean).join(" ") || "—";

/**
 * After the week: did each completed work tracker of the zone and week reach its drop-off, by the
 * bleacher's GPS? Worst first, a count per status (click one to show only it), and Check now for
 * administrators and account managers. A row opens the work tracker.
 */
export function DeliveryProofTab() {
  const { zoneId, weekStart } = useZoneWeekParams();
  const compiled = useMemo(() => weekProofsQuery(zoneId, weekStart), [zoneId, weekStart]);
  const { data, isLoading } = useTypedQuery(compiled, expect<WeekProofRow>());
  const lastCompiled = useMemo(() => lastCheckQuery(), []);
  const { data: last } = useTypedQuery(lastCompiled, expect<{ last: string | null }>());

  const access = useUserAccess();
  const canCheck = access.status === "active" && canCheckDeliveryNow(access.roles);
  const [checking, setChecking] = useState(false);
  const [filter, setFilter] = useState<ListStatus | null>(null);
  const [open, setOpen] = useState<Tables<"WorkTrackers"> | null>(null);

  const rows = useMemo(() => sortWorstFirst(data ?? []), [data]);
  const counts = useMemo(() => proofCounts(rows), [rows]);
  const shown = filter ? rows.filter((r) => listStatus(r.status) === filter) : rows;

  const checkNow = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/delivery-proof/check", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Check failed (${res.status})`);
      const s = body as DeliveryProofSummary;
      createSuccessToast([
        `Checked ${s.checked} work tracker${s.checked === 1 ? "" : "s"}`,
        `${s.verified} verified · ${s.notFound} not found · ${s.waiting} waiting`,
      ]);
    } catch (e) {
      createErrorToastNoThrow(["Could not check the GPS", e instanceof Error ? e.message : ""]);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-testid="delivery-proof-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Completed work trackers this week, checked daily against the bleacher&apos;s GPS:
          delivered means {PROOF_RADIUS_TEXT} after the driver tapped Complete.
        </p>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Last checked {when(last?.[0]?.last ?? null)}
          </span>
          {canCheck && (
            <Button size="sm" onClick={checkNow} disabled={checking}>
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : "Check now"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {PROOF_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(filter === s ? null : s)}
            className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold ${BADGE[s]} ${
              filter === s ? "ring-2 ring-blue-500" : ""
            } ${counts[s] === 0 ? "opacity-50" : ""}`}
            data-testid={`proof-count-${s}`}
          >
            {PROOF_LABEL[s]} {counts[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-500">
          {rows.length === 0
            ? "No completed work trackers in this zone and week yet."
            : "None with this status."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-black/15">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2">Bleacher</th>
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2">Drop-off</th>
                <th className="px-3 py-2">Distance</th>
                <th className="px-3 py-2">GPS saw it at</th>
                <th className="px-3 py-2">Tracker last report</th>
                <th className="px-3 py-2">Checked</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((r) => {
                const s = listStatus(r.status);
                return (
                  <tr
                    key={r.id}
                    onClick={() =>
                      setOpen({
                        id: r.id,
                        bleacher_uuid: r.bleacher_uuid,
                        date: r.date,
                      } as Tables<"WorkTrackers">)
                    }
                    className="cursor-pointer hover:bg-gray-50"
                    data-testid="proof-row"
                    data-status={s}
                  >
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${BADGE[s]}`}
                      >
                        {PROOF_LABEL[s]}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(r.completed_at)}</td>
                    <td className="px-3 py-2">#{r.bleacher_number ?? "—"}</td>
                    <td className="px-3 py-2">{driverName(r)}</td>
                    <td className="px-3 py-2">
                      {[r.dropoff_street, r.dropoff_city].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{distance(r.distance_meters)}</td>
                    <td className="px-3 py-2">{r.evidence_place ?? "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(r.gps_last_report_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{when(r.checked_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <WorkTrackerModal
        selectedWorkTracker={open}
        setSelectedWorkTracker={setOpen}
        setSelectedBlock={() => {}}
      />
    </div>
  );
}
