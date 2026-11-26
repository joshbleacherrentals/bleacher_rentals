"use client";

import { useMemo, useState } from "react";
import type { Selectable } from "kysely";
import { DateTime } from "luxon";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import type { PowerSyncDB } from "@/lib/powersync/AppSchema";
import { useZoneWeekParams } from "../hooks/useZoneWeekParams";
import { autoWorkTrackerKey } from "../utils/autoWorkTrackerKey";
import { weekTrackersQuery } from "../db/modelTrackers";
import {
  bleacherNumbersQuery,
  currentLineItemsQuery,
  currentTrackersQuery,
  driverNamesQuery,
  runFeedbackQuery,
  runTripsQuery,
  runsForWeekQuery,
} from "../db/runs";
import { describeSettings, resolveSettings, type PlannerSettings } from "../planner/settings";
import type { TripSnapshot } from "../planner/runLog";
import { parseTimestamp, reviewTrip, weekTimeline, type TripState } from "../utils/runReview";

type RunRow = {
  id: string;
  created_at: string | null;
  app_version: string | null;
  commit_sha: string | null;
  settings: string | null;
  result: string | null;
  trips_created: number | null;
  discarded_at: string | null;
  created_by_first: string | null;
  created_by_last: string | null;
  discarded_by_first: string | null;
  discarded_by_last: string | null;
};

type FeedbackRow = {
  id: string;
  created_at: string | null;
  kind: string | null;
  reason: string | null;
  work_tracker_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
};

const name = (first: string | null, last: string | null) =>
  [first, last].filter(Boolean).join(" ") || "Someone";

const when = (ts: string | null) =>
  ts ? DateTime.fromMillis(parseTimestamp(ts)).toFormat("MMM d, h:mm a") : "—";

const parse = <T,>(text: string | null): T | null => {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
};

const STATE_LOOK: Record<TripState, string> = {
  kept: "bg-green-100 text-green-800",
  edited: "bg-amber-100 text-amber-800",
  deleted: "bg-red-100 text-red-700",
};

/**
 * Model runs for the selected zone and week: every time Create work trackers ran (who, when, the
 * version and settings), which ones were discarded, and for the chosen run what became of each trip
 * it planned (kept, edited and how, or deleted) with the reasons people gave. Read-only.
 */
export function ModelRunsTab() {
  const { zoneId, weekStart } = useZoneWeekParams();
  const key = autoWorkTrackerKey(zoneId, weekStart);

  const runsCompiled = useMemo(() => runsForWeekQuery(key), [key]);
  const { data: runs, isLoading } = useTypedQuery(runsCompiled, expect<RunRow>());
  const [picked, setPicked] = useState<string | null>(null);
  const run =
    runs?.find((r) => r.id === picked) ?? runs?.find((r) => !r.discarded_at) ?? runs?.[0] ?? null;

  const tripsCompiled = useMemo(() => runTripsQuery(run?.id ?? "__none__"), [run?.id]);
  const { data: trips } = useTypedQuery(
    tripsCompiled,
    expect<{ id: string; work_tracker_uuid: string | null; snapshot: string | null }>(),
  );
  const ids = useMemo(
    () => (trips ?? []).flatMap((t) => (t.work_tracker_uuid ? [t.work_tracker_uuid] : [])),
    [trips],
  );
  const trackersCompiled = useMemo(() => currentTrackersQuery(ids), [ids]);
  const { data: trackers } = useTypedQuery(
    trackersCompiled,
    expect<Selectable<PowerSyncDB["WorkTrackers"]>>(),
  );
  const linesCompiled = useMemo(() => currentLineItemsQuery(ids), [ids]);
  const { data: lines } = useTypedQuery(
    linesCompiled,
    expect<{
      work_tracker_uuid: string | null;
      type: string | null;
      qty_decimal: number | null;
      unit_amt_cents: number | null;
    }>(),
  );
  const feedbackCompiled = useMemo(() => runFeedbackQuery(run?.id ?? "__none__"), [run?.id]);
  const { data: feedback } = useTypedQuery(feedbackCompiled, expect<FeedbackRow>());
  const weekCompiled = useMemo(
    () => weekTrackersQuery(zoneId, weekStart, key),
    [zoneId, weekStart, key],
  );
  const { data: weekTrackers } = useTypedQuery(
    weekCompiled,
    expect<{
      id: string;
      auto_work_tracker_id: string | null;
      status: string | null;
      created_at: string | null;
    }>(),
  );

  const reviews = useMemo(() => {
    const byId = new Map((trackers ?? []).map((t) => [t.id, t as Record<string, unknown>]));
    return (trips ?? []).flatMap((t) => {
      const snapshot = parse<TripSnapshot>(t.snapshot);
      if (!snapshot || !t.work_tracker_uuid) return [];
      const id = t.work_tracker_uuid;
      const current = byId.get(id) ?? null;
      const currentLines = (lines ?? []).filter((l) => l.work_tracker_uuid === id);
      return [{ id, snapshot, current, ...reviewTrip(snapshot, current, currentLines) }];
    });
  }, [trips, trackers, lines]);

  const driverIds = useMemo(
    () => [
      ...new Set(
        reviews.flatMap((r) =>
          [r.snapshot.tracker.driver_uuid, r.current?.driver_uuid].filter(
            (v): v is string => typeof v === "string",
          ),
        ),
      ),
    ],
    [reviews],
  );
  const driversCompiled = useMemo(() => driverNamesQuery(driverIds), [driverIds]);
  const { data: drivers } = useTypedQuery(
    driversCompiled,
    expect<{ id: string; first_name: string | null; last_name: string | null }>(),
  );
  const driverName = (id: unknown) => {
    const d = (drivers ?? []).find((x) => x.id === id);
    return d ? name(d.first_name, d.last_name) : "—";
  };
  const bleacherIds = useMemo(
    () => [
      ...new Set(
        reviews.flatMap((r) =>
          typeof r.snapshot.tracker.bleacher_uuid === "string"
            ? [r.snapshot.tracker.bleacher_uuid]
            : [],
        ),
      ),
    ],
    [reviews],
  );
  const bleachersCompiled = useMemo(() => bleacherNumbersQuery(bleacherIds), [bleacherIds]);
  const { data: bleachers } = useTypedQuery(
    bleachersCompiled,
    expect<{ id: string; bleacher_number: number | null }>(),
  );
  const bleacherNumber = (id: unknown) =>
    (bleachers ?? []).find((b) => b.id === id)?.bleacher_number ?? "?";

  if (!zoneId) return <p className="text-sm text-gray-500">Select a zone to see its runs.</p>;
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  if (!runs || runs.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No runs for this zone and week yet. Each click of Create work trackers is recorded here.
      </p>
    );
  }

  const counts = { kept: 0, edited: 0, deleted: 0 };
  for (const r of reviews) counts[r.state]++;
  const timeline =
    run?.created_at && weekTrackers
      ? weekTimeline(weekTrackers, run.created_at, new Set(reviews.map((r) => r.id)))
      : null;
  const runFeedback = feedback ?? [];
  const whyFor = (id: string) => runFeedback.filter((f) => f.work_tracker_uuid === id);
  const discardWhy = runFeedback.filter((f) => f.kind === "discard");

  return (
    <div className="flex flex-col gap-6" data-testid="model-runs">
      <section>
        <h2 className="mb-2 text-sm font-semibold">Runs this week ({runs.length})</h2>
        <ul className="divide-y rounded-md border border-black/15">
          {runs.map((r) => {
            const settings = parse<Partial<PlannerSettings>>(r.settings);
            const active = r.id === run?.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setPicked(r.id)}
                  aria-pressed={active}
                  className={`flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left text-sm ${
                    active ? "bg-blue-50 ring-2 ring-blue-500 ring-inset" : "hover:bg-gray-50"
                  }`}
                  data-testid="model-run"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{when(r.created_at)}</span>
                    <span className="text-gray-600">
                      by {name(r.created_by_first, r.created_by_last)} · {r.trips_created ?? 0}{" "}
                      trips
                    </span>
                    {r.discarded_at ? (
                      <span className="rounded bg-gray-200 px-1.5 text-xs text-gray-700">
                        Discarded {when(r.discarded_at)} by{" "}
                        {name(r.discarded_by_first, r.discarded_by_last)}
                      </span>
                    ) : (
                      <span className="rounded bg-green-100 px-1.5 text-xs text-green-800">
                        In use
                      </span>
                    )}
                  </span>
                  {settings && (
                    <span className="text-xs text-gray-500">
                      {describeSettings(resolveSettingsFromJson(settings))}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">
                    Version {r.app_version ?? "?"}
                    {r.commit_sha ? ` · commit ${r.commit_sha.slice(0, 7)}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {run && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            Run of {when(run.created_at)}: what became of its trips
          </h2>
          <div className="flex flex-wrap gap-2 text-xs" data-testid="model-run-summary">
            <span className={`rounded px-2 py-0.5 ${STATE_LOOK.kept}`}>{counts.kept} kept</span>
            <span className={`rounded px-2 py-0.5 ${STATE_LOOK.edited}`}>
              {counts.edited} edited
            </span>
            <span className={`rounded px-2 py-0.5 ${STATE_LOOK.deleted}`}>
              {counts.deleted} deleted
            </span>
            {timeline && (
              <span className="text-gray-600">
                Week: {timeline.before} made by hand before the run · {timeline.model} by the run ·{" "}
                {timeline.after} by hand after it
              </span>
            )}
          </div>
          {discardWhy.length > 0 && (
            <ul className="text-sm text-gray-700">
              {discardWhy.map((f) => (
                <li key={f.id}>
                  <span className="font-medium">Discarded because:</span> “{f.reason}” —{" "}
                  {name(f.first_name, f.last_name)}
                </li>
              ))}
            </ul>
          )}

          {reviews.length === 0 ? (
            <p className="text-sm text-gray-500">This run created no work trackers.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-200 text-left">
                    <th className="border border-black/15 px-2 py-1">Bleacher</th>
                    <th className="border border-black/15 px-2 py-1">Planned</th>
                    <th className="border border-black/15 px-2 py-1">Now</th>
                    <th className="border border-black/15 px-2 py-1">What changed</th>
                    <th className="border border-black/15 px-2 py-1">Why</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr key={r.id} data-testid="model-run-trip" data-state={r.state}>
                      <td className="border border-black/15 px-2 py-1">
                        #{bleacherNumber(r.snapshot.tracker.bleacher_uuid)}
                      </td>
                      <td className="border border-black/15 px-2 py-1">
                        {driverName(r.snapshot.tracker.driver_uuid)} ·{" "}
                        {String(r.snapshot.tracker.date ?? "—")}
                      </td>
                      <td className="border border-black/15 px-2 py-1">
                        <span className={`mr-1 rounded px-1.5 text-xs ${STATE_LOOK[r.state]}`}>
                          {r.state}
                        </span>
                        {r.current
                          ? `${driverName(r.current.driver_uuid)} · ${String(r.current.date ?? "—").slice(0, 10)} · ${String(r.current.status ?? "")}`
                          : ""}
                      </td>
                      <td className="border border-black/15 px-2 py-1 text-xs">
                        {r.changes.length === 0
                          ? "—"
                          : r.changes.map((c) => (
                              <div key={c.field}>
                                <span className="font-medium">{c.label}:</span>{" "}
                                {c.field === "driver_uuid"
                                  ? `${driverName(c.before)} → ${driverName(c.after)}`
                                  : `${c.before} → ${c.after}`}
                              </div>
                            ))}
                      </td>
                      <td className="border border-black/15 px-2 py-1 text-xs">
                        {whyFor(r.id).map((f) => (
                          <div key={f.id}>
                            “{f.reason}” — {name(f.first_name, f.last_name)}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** A run's stored settings as PlannerSettings, filling anything missing with today's defaults. */
function resolveSettingsFromJson(s: Partial<PlannerSettings>): PlannerSettings {
  const d = resolveSettings(null);
  return { ...d, ...s };
}
