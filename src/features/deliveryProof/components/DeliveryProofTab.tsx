"use client";

import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppTooltip } from "@/components/AppTooltip";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import {
  DriverWeekGrid,
  GRID_LINES as LINES,
} from "@/features/scheduleValidator/components/DriverWeekGrid";
import { DriverLinksMenu } from "@/features/scheduleValidator/components/DriverLinksMenu";
import { DriverNameWithKind } from "@/features/scheduleValidator/components/DriverNameWithKind";
import { useDriverUserUuids } from "@/features/scheduleValidator/hooks/useDriverUserUuids";
import { useDriverKinds } from "@/features/scheduleValidator/hooks/useDriverKinds";
import { lastCheckQuery } from "../db/weekProofsQuery";
import {
  PROOF_LABEL,
  PROOF_ORDER,
  canCheckDeliveryNow,
  dayLines,
  type ProofCategory,
  type ProofDay,
} from "../logic/proofList";
import { PROOF_RADIUS_TEXT } from "../logic/describeProof";
import type { DeliveryProofSummary } from "../server/runDeliveryProofs";

const TEXT: Record<ProofCategory, string> = {
  overdue: "text-red-700 font-semibold",
  not_found: "text-red-700 font-semibold",
  no_gps: "text-amber-700",
  no_location: "text-amber-700",
  waiting: "text-gray-600",
  unchecked: "text-gray-500",
  not_completed: "text-gray-400",
  verified: "text-green-700",
  cancelled: "text-gray-300",
};

const MEANING: Record<ProofCategory, string> = {
  overdue: "its day has passed and the driver has not tapped Complete",
  not_found: "GPS saw the bleacher, but not at the drop-off",
  no_gps: "no GPS report to go on (no tracker, or none in time)",
  no_location: "the drop-off address has no map position",
  waiting: "no GPS report since it was completed yet; checked again daily",
  unchecked: "completed, but the daily check has not looked yet",
  not_completed: "not completed yet, and its day has not passed",
  verified: `the bleacher's GPS stood ${PROOF_RADIUS_TEXT}`,
  cancelled: "cancelled, declined or abandoned: nobody is making the trip",
};

const when = (ts: string | null) =>
  ts ? DateTime.fromISO(ts.replace(" ", "T")).toFormat("MMM d, h:mm a") : "never";

function ProofCell({ day }: { day: ProofDay }) {
  const lines = dayLines(day);
  if (lines.length === 0) return <div className={`min-h-12 ${LINES}`} />;
  const bad = (day.counts.not_found ?? 0) + (day.counts.overdue ?? 0) > 0;
  return (
    <div
      className={`flex min-h-12 flex-col justify-center gap-0.5 px-1.5 py-1 text-[12px] leading-tight ${LINES} ${
        bad ? "bg-red-50" : ""
      }`}
      data-testid="delivery-proof-cell"
    >
      {lines.map((l) => (
        <span key={l.category} className={`truncate ${TEXT[l.category]}`}>
          {l.text}
        </span>
      ))}
    </div>
  );
}

/**
 * Proof of Delivery, a Verify page: a row per driver in the zone with a trip this week, a column
 * per day, each cell counting that day's trips by GPS proof (2 waiting, 1 no GPS, 1 verified). Every
 * trip counts, whatever its status; one not completed after its day is overdue. Check now (administrators and AMs) runs the daily GPS check at
 * once.
 */
export function DeliveryProofTab() {
  const { zoneId, weekStart } = useZoneWeekParams();
  const userUuids = useDriverUserUuids(zoneId);
  const kinds = useDriverKinds(zoneId);
  const { drivers, isLoading } = useChecks().deliveryProof;
  const lastCompiled = useMemo(() => lastCheckQuery(), []);
  const { data: last } = useTypedQuery(lastCompiled, expect<{ last: string | null }>());

  const access = useUserAccess();
  const canCheck = access.status === "active" && canCheckDeliveryNow(access.roles);
  const [checking, setChecking] = useState(false);

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

  const legend = (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {PROOF_ORDER.map((c) => (
        <AppTooltip key={c} content={MEANING[c]}>
          <span className={`cursor-default ${TEXT[c]}`}>{PROOF_LABEL[c]}</span>
        </AppTooltip>
      ))}
    </div>
  );

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      {legend}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500">Last checked {when(last?.[0]?.last ?? null)}</span>
        {canCheck && (
          <Button size="sm" onClick={checkNow} disabled={checking}>
            <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
            {checking ? "Checking…" : "Check now"}
          </Button>
        )}
      </div>
    </div>
  );

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its drivers.</p>;
  }
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div data-testid="delivery-proof-page">
      {header}
      {drivers.length === 0 ? (
        <p className="text-sm text-gray-500">
          No drivers in this zone have work trackers this week.
        </p>
      ) : (
        <DriverWeekGrid
          weekStart={weekStart}
          renderDriverName={(driver) => (
            <DriverNameWithKind name={driver.driverName} kind={kinds.get(driver.driverUuid)} />
          )}
          renderDriverActions={(driver) => (
            <DriverLinksMenu
              userUuid={userUuids.get(driver.driverUuid)}
              weekStart={weekStart}
              driverName={driver.driverName}
            />
          )}
          drivers={drivers}
          renderDay={(day) => <ProofCell day={day} />}
          testId="delivery-proof"
        />
      )}
    </div>
  );
}
