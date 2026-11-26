"use client";

import { useMemo } from "react";
import { AppTooltip } from "@/components/AppTooltip";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { proofStatusesQuery } from "../db/weekProofsQuery";
import { PROOF_RADIUS_TEXT, describeProof, shortProof } from "../logic/describeProof";

export type ProofCellRow = {
  work_tracker_uuid: string | null;
  status: string | null;
  final: number | null;
  evidence_at: string | null;
  distance_meters: number | null;
  evidence_place: string | null;
  gps_last_report_at: string | null;
};

/** The GPS proof of each listed work tracker, by id (missing before the first check). */
export function useProofsByTracker(ids: string[]): Map<string, ProofCellRow> {
  const key = ids.join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const compiled = useMemo(() => proofStatusesQuery(ids), [key]);
  const { data } = useTypedQuery(compiled, expect<ProofCellRow>());
  return useMemo(() => new Map((data ?? []).map((p) => [p.work_tracker_uuid ?? "", p])), [data]);
}

const COLOR = { good: "text-green-700", bad: "text-red-700", neutral: "text-gray-500" } as const;

/**
 * The Proof of Delivery cell of a driver's week: the GPS check in a few words (✓ 120 m, ✗ 79 km ·
 * Main Yard, Waiting, No GPS), the full line on hover. Empty for a tracker that is not completed.
 */
export function DeliveryProofCell({
  proof,
  trackerStatus,
}: {
  proof: ProofCellRow | undefined;
  trackerStatus: string | null;
}) {
  const short = shortProof(proof ?? null, trackerStatus);
  if (!short) return null;
  const long = proof
    ? describeProof(proof)?.text
    : "The daily GPS check has not looked at this work tracker yet.";
  return (
    <AppTooltip
      className="max-w-xs"
      content={
        <div className="flex flex-col gap-1">
          <span>{long ?? short.text}</span>
          <span className="opacity-70">
            Checked daily against the bleacher&apos;s GPS: delivered means {PROOF_RADIUS_TEXT}.
          </span>
        </div>
      }
    >
      <span
        className={`font-medium ${COLOR[short.tone]}`}
        data-testid="delivery-proof-cell"
        data-status={proof?.status ?? "unchecked"}
      >
        {short.text}
      </span>
    </AppTooltip>
  );
}
