"use client";

import { useMemo } from "react";
import { AppTooltip } from "@/components/AppTooltip";
import { MapPinCheck, MapPinOff, MapPin } from "lucide-react";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { deliveryProofQuery } from "../db/deliveryProofQuery";
import { PROOF_RADIUS_TEXT, describeProof } from "../logic/describeProof";

const LOOK = {
  good: "border-green-200 bg-green-50 text-green-800",
  bad: "border-red-200 bg-red-50 text-red-700",
  neutral: "border-gray-200 bg-gray-50 text-gray-600",
} as const;
const ICON = { good: MapPinCheck, bad: MapPinOff, neutral: MapPin } as const;

/**
 * The GPS proof of delivery under a work tracker's status, once the daily check has looked at it:
 * confirmed (the bleacher's GPS stood within 500 m of the drop-off after Complete), not seen there,
 * or no data. Nothing before the first check.
 */
export function DeliveryProofLine({ workTrackerId }: { workTrackerId: string | undefined }) {
  const compiled = useMemo(() => deliveryProofQuery(workTrackerId ?? "__none__"), [workTrackerId]);
  const { data } = useTypedQuery(
    compiled,
    expect<{
      status: string | null;
      final: number | null;
      checked_at: string | null;
      evidence_at: string | null;
      distance_meters: number | null;
      evidence_place: string | null;
      gps_last_report_at: string | null;
    }>(),
  );
  const proof = workTrackerId ? data?.[0] : undefined;
  const line = proof ? describeProof(proof) : null;
  if (!line) return null;
  const Icon = ICON[line.tone];
  return (
    <AppTooltip
      className="max-w-xs"
      content={`Checked daily against the bleacher's Linxup GPS: delivered means ${PROOF_RADIUS_TEXT} after the driver tapped Complete.`}
    >
      <div
        className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${LOOK[line.tone]}`}
        data-testid="delivery-proof"
        data-status={proof?.status}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {line.text}
      </div>
    </AppTooltip>
  );
}
