"use client";

import { useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { Eye, Loader2, MapPin, RotateCcw, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { expect, typedExecuteBatch, typedGetAll, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { useCurrentUser } from "@/hooks/db/useCurrentUser";
import { GeocodeRateLimited, browserLookup } from "@/lib/geocoding/browserGeocode";
import {
  EMPTY_TOTALS,
  parseGeo,
  planRevert,
  type BackfillAddress,
  type BackfillTotals,
  type GeoValues,
  type ReviewRow,
} from "@/features/addressBackfill/logic/backfill";
import { runBackfill, type PlannedChange } from "@/features/addressBackfill/logic/runBackfill";
import {
  changeStatements,
  changesQuery,
  currentGeoQuery,
  missingAddressesQuery,
  revertStatements,
  runChangesQuery,
  twinCandidatesQuery,
} from "@/features/addressBackfill/db/backfillDb";

const OUTCOME: Record<ReviewRow["outcome"], { text: string; look: string }> = {
  twin: { text: "Copy from identical address", look: "text-green-700" },
  google: { text: "Use Google's answer", look: "text-green-700" },
  none: { text: "Leave for a person", look: "text-amber-700" },
};

type ChangeListRow = {
  id: string;
  run_uuid: string | null;
  created_at: string | null;
  source: string | null;
  reverted_at: string | null;
  first_name: string | null;
  last_name: string | null;
};

type Run = {
  runUuid: string;
  startedAt: string | null;
  by: string;
  total: number;
  twin: number;
  google: number;
  reverted: number;
};

const when = (ts: string | null) =>
  ts ? DateTime.fromISO(ts.replace(" ", "T")).toFormat("MMM d, h:mm a") : "—";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ReviewTable({ rows }: { rows: ReviewRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-black/15">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs text-gray-600">
          <tr>
            <th className="px-3 py-2">Our address</th>
            <th className="px-3 py-2">Google&apos;s answer</th>
            <th className="px-3 py-2">What happens</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} data-testid="address-backfill-row" data-outcome={r.outcome}>
              <td className="px-3 py-2">{r.text || "—"}</td>
              <td className="px-3 py-2 text-gray-600">{r.google ?? "—"}</td>
              <td className={`px-3 py-2 ${OUTCOME[r.outcome].look}`}>
                {OUTCOME[r.outcome].text}
                {r.reason && <span className="block text-xs text-gray-500">{r.reason}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Dev Tools → Address Backfill (administrators): fills in the map position of addresses saved
 * without one, from this browser, with the Google Maps key the app already loads. Preview looks at
 * 20 and writes nothing. Run goes through every one, 25 at a time, writing each change and its log
 * (AddressBackfillChanges) in one PowerSync batch; Stop ends it between batches. Every run is
 * listed with Revert, which puts back only the addresses that still hold what the run wrote.
 */
export default function AddressBackfillPage() {
  const access = useUserAccess();
  const isAdmin = access.status === "active" && access.roles.includes("admin");
  const { data: me } = useCurrentUser();
  const userUuid = me?.[0]?.id ?? null;

  const missingCompiled = useMemo(() => missingAddressesQuery(), []);
  const { data: missingRows } = useTypedQuery(missingCompiled, expect<BackfillAddress>());
  const changesCompiled = useMemo(() => changesQuery(), []);
  const { data: changeRows } = useTypedQuery(changesCompiled, expect<ChangeListRow>());

  const [totals, setTotals] = useState<BackfillTotals>(EMPTY_TOTALS);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [preview, setPreview] = useState<ReviewRow[] | null>(null);
  const [busy, setBusy] = useState<"preview" | "run" | "revert" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevert, setConfirmRevert] = useState<Run | null>(null);
  const stopRef = useRef(false);

  const runs = useMemo<Run[]>(() => {
    const byRun = new Map<string, Run>();
    for (const c of changeRows ?? []) {
      if (!c.run_uuid) continue;
      let run = byRun.get(c.run_uuid);
      if (!run) {
        run = {
          runUuid: c.run_uuid,
          startedAt: c.created_at,
          by: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Someone",
          total: 0,
          twin: 0,
          google: 0,
          reverted: 0,
        };
        byRun.set(c.run_uuid, run);
      }
      run.total++;
      if (c.source === "twin") run.twin++;
      if (c.source === "google") run.google++;
      if (c.reverted_at) run.reverted++;
      if (c.created_at && (!run.startedAt || c.created_at < run.startedAt)) {
        run.startedAt = c.created_at;
      }
    }
    return [...byRun.values()].sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
  }, [changeRows]);

  const deps = (runUuid: string, preview: boolean) => ({
    readTwins: (streets: string[]) =>
      typedGetAll(twinCandidatesQuery(streets), expect<BackfillAddress>()),
    lookup: (a: BackfillAddress) => browserLookup(a),
    isRateLimited: (e: unknown) => e instanceof GeocodeRateLimited,
    write: (changes: PlannedChange[]) => {
      const now = new Date().toISOString();
      return typedExecuteBatch(
        changes.flatMap((c) =>
          changeStatements({ ...c, changeId: crypto.randomUUID(), runUuid, userUuid, now }),
        ),
      );
    },
    sleep,
    onProgress: (t: BackfillTotals, done: number, of: number) => {
      // A preview has its own table (with What happens); only a run fills the totals and the
      // list of addresses left for a person.
      if (!preview) setTotals(t);
      setProgress({ done, of });
    },
    shouldStop: () => stopRef.current,
  });

  const start = async (mode: "preview" | "run") => {
    setBusy(mode);
    setError(null);
    stopRef.current = false;
    setTotals(EMPTY_TOTALS);
    setProgress(null);
    setPreview(null);
    try {
      // A snapshot of what is missing right now; rows filled meanwhile are left alone on write.
      const rows = [...(missingRows ?? [])];
      const preview = mode === "preview";
      const result = await runBackfill(rows, deps(crypto.randomUUID(), preview), preview);
      if (mode === "preview") setPreview(result.review);
      else {
        setTotals(result);
        createSuccessToast([
          `Backfill ${stopRef.current ? "stopped" : "finished"}`,
          `${result.copied + result.geocoded} addresses given a map position`,
        ]);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`Stopped: ${message}. What was written before this is kept, and listed under Runs.`);
    } finally {
      setBusy(null);
    }
  };

  const revert = async (run: Run) => {
    setBusy("revert");
    try {
      const changes = (
        await typedGetAll(
          runChangesQuery(run.runUuid),
          expect<{
            id: string;
            address_uuid: string | null;
            before: string | null;
            after: string | null;
            reverted_at: string | null;
          }>(),
        )
      ).flatMap((c) =>
        c.address_uuid
          ? [
              {
                id: c.id,
                address_uuid: c.address_uuid,
                before: parseGeo(c.before),
                after: parseGeo(c.after),
                reverted_at: c.reverted_at,
              },
            ]
          : [],
      );
      const current = await typedGetAll(
        currentGeoQuery(changes.map((c) => c.address_uuid)),
        expect<{
          id: string;
          latitude: number | null;
          longitude: number | null;
          place_id: string | null;
          country: string | null;
        }>(),
      );
      const plan = planRevert(changes, new Map(current.map((r) => [r.id, r])));
      const now = new Date().toISOString();
      for (let i = 0; i < plan.restore.length; i += 100) {
        await typedExecuteBatch(
          plan.restore.slice(i, i + 100).flatMap((r) => revertStatements({ ...r, userUuid, now })),
        );
      }
      createSuccessToast([
        `Reverted ${plan.restore.length} address${plan.restore.length === 1 ? "" : "es"}`,
        plan.changedSince > 0
          ? `${plan.changedSince} kept: someone changed them since`
          : "Nothing had been changed since",
      ]);
    } catch (e) {
      createErrorToastNoThrow(["Could not revert the run", e instanceof Error ? e.message : ""]);
    } finally {
      setBusy(null);
      setConfirmRevert(null);
    }
  };

  if (access.status === "active" && !isAdmin) {
    return (
      <div className="p-4">
        <PageHeader title="Address Backfill" />
        <p className="text-sm text-gray-500">Administrators only.</p>
      </div>
    );
  }

  const missing = missingRows?.length ?? null;
  const left = totals.uncertain + totals.notFound + totals.noStreet;

  return (
    <div className="p-4">
      <PageHeader
        title="Address Backfill"
        subtitle="Fills in the map position of addresses saved without one: first from an identical address that has it, then from Google, but only when Google found that exact building, street number or named place in the row's state or province. Only the position, place id and a blank country are written; street text never changes. Every run can be reverted."
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-sm">
          <MapPin className="h-4 w-4 text-gray-500" />
          {missing == null ? "Counting…" : `${missing} addresses have no map position.`}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => start("preview")} disabled={!!busy || !missing}>
            {busy === "preview" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Preview 20 (writes nothing)
          </Button>
          <Button onClick={() => start("run")} disabled={!!busy || !missing}>
            {busy === "run" && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy === "run" ? "Running…" : "Run"}
          </Button>
          {busy === "run" && (
            <>
              <Button variant="outline" onClick={() => (stopRef.current = true)}>
                <Square className="h-4 w-4" />
                Stop after this batch
              </Button>
              {progress && (
                <span className="text-sm text-gray-500">
                  {progress.done} of {progress.of} · keep this tab open
                </span>
              )}
            </>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {preview && (
          <section className="flex flex-col gap-2" data-testid="address-backfill-preview">
            <h2 className="text-sm font-semibold">Preview: nothing was written</h2>
            <ReviewTable rows={preview} />
          </section>
        )}

        {busy !== "preview" && totals.scanned > 0 && (
          <dl
            className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-black/15 p-3 text-sm"
            data-testid="address-backfill-result"
          >
            <dt className="text-gray-500">Looked at</dt>
            <dd className="tabular-nums">{totals.scanned}</dd>
            <dt className="text-gray-500">Copied from an identical address</dt>
            <dd className="tabular-nums">{totals.copied}</dd>
            <dt className="text-gray-500">Found by Google</dt>
            <dd className="tabular-nums">{totals.geocoded}</dd>
            <dt className="text-gray-500">Google not sure (left alone)</dt>
            <dd className="tabular-nums">{totals.uncertain}</dd>
            <dt className="text-gray-500">Google found nothing</dt>
            <dd className="tabular-nums">{totals.notFound}</dd>
            <dt className="text-gray-500">No street or city to look up</dt>
            <dd className="tabular-nums">{totals.noStreet}</dd>
          </dl>
        )}

        {busy !== "preview" && totals.review.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">
              Left for a person: fix on Event Data or Bleacher Data ({totals.review.length}
              {left > totals.review.length ? ` of ${left}, the first shown` : ""})
            </h2>
            <ReviewTable rows={totals.review} />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Runs</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-gray-500">No runs yet.</p>
          ) : (
            <ul className="divide-y rounded-md border border-black/15 text-sm">
              {runs.map((run) => {
                const fullyReverted = run.reverted === run.total;
                return (
                  <li
                    key={run.runUuid}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    data-testid="address-backfill-run"
                  >
                    <span>
                      {when(run.startedAt)} · {run.by} · {run.total} address
                      {run.total === 1 ? "" : "es"} ({run.twin} copied, {run.google} from Google)
                      {run.reverted > 0 && (
                        <span className="ml-1 text-amber-700">
                          · {fullyReverted ? "reverted" : `${run.reverted} reverted`}
                        </span>
                      )}
                    </span>
                    {!fullyReverted && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!!busy}
                        onClick={() => setConfirmRevert(run)}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Revert
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <AlertDialog open={!!confirmRevert} onOpenChange={(o) => !o && setConfirmRevert(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert this run?</AlertDialogTitle>
            <AlertDialogDescription>
              Its {confirmRevert?.total} addresses go back to having no map position. Any address
              someone has changed since is left as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "revert"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === "revert"}
              onClick={(e) => {
                e.preventDefault();
                if (confirmRevert) void revert(confirmRevert);
              }}
            >
              {busy === "revert" ? "Reverting…" : "Revert"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
