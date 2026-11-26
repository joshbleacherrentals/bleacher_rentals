import { DateTime } from "luxon";
import { DELIVERY_RADIUS_M } from "./verdict";

export type ProofLine = { tone: "good" | "bad" | "neutral"; text: string };

const distance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const at = (ts: string | null) =>
  ts ? DateTime.fromISO(ts.replace(" ", "T")).toFormat("MMM d, h:mm a") : null;

/** The GPS proof of delivery as one line for the work tracker window. Pure. */
export function describeProof(p: {
  status: string | null;
  final: number | boolean | null;
  evidence_at: string | null;
  distance_meters: number | null;
  evidence_place?: string | null;
  gps_last_report_at?: string | null;
}): ProofLine | null {
  const when = at(p.evidence_at);
  const lastReport = at(p.gps_last_report_at ?? null);
  switch (p.status) {
    case "verified":
      return {
        tone: "good",
        text: `Delivery confirmed by GPS${when ? ` · ${when}` : ""}${
          p.distance_meters != null ? ` · ${distance(p.distance_meters)} from the drop-off` : ""
        }`,
      };
    case "not_found":
      return {
        tone: "bad",
        text: `GPS did not see it at the drop-off${
          p.evidence_place ? ` · seen at ${p.evidence_place}` : ""
        }${p.distance_meters != null ? `, ${distance(p.distance_meters)} away` : ""}${
          p.final ? "" : " · checking again tomorrow"
        }`,
      };
    case "waiting":
      return {
        tone: "neutral",
        text: `GPS: no report since it was completed yet${
          lastReport ? ` (tracker last reported ${lastReport})` : ""
        } · checking daily`,
      };
    case "no_gps":
      return {
        tone: "neutral",
        text: `GPS: no data to confirm this delivery${
          lastReport ? ` · tracker last reported ${lastReport}` : ""
        }`,
      };
    case "no_location":
      return { tone: "neutral", text: "GPS: the drop-off address has no map position" };
    default:
      return null;
  }
}

/**
 * The proof in a few words, for the Proof of Delivery column of a driver's week (describeProof is
 * the long line, shown on hover). A completed tracker the check has not looked at yet says so;
 * any other tracker without a proof shows nothing.
 */
export function shortProof(
  p: {
    status: string | null;
    distance_meters: number | null;
    evidence_place?: string | null;
  } | null,
  trackerStatus: string | null,
): ProofLine | null {
  switch (p?.status) {
    case "verified":
      return {
        tone: "good",
        text: `✓${p.distance_meters != null ? ` ${distance(p.distance_meters)}` : ""}`,
      };
    case "not_found":
      return {
        tone: "bad",
        text: `✗${p.distance_meters != null ? ` ${distance(p.distance_meters)}` : ""}${
          p.evidence_place ? ` · ${p.evidence_place}` : ""
        }`,
      };
    case "waiting":
      return { tone: "neutral", text: "Waiting" };
    case "no_gps":
      return { tone: "neutral", text: "No GPS" };
    case "no_location":
      return { tone: "neutral", text: "No location" };
    default:
      return trackerStatus === "completed" ? { tone: "neutral", text: "Not checked yet" } : null;
  }
}

export const PROOF_RADIUS_TEXT = `within ${DELIVERY_RADIUS_M} m of the drop-off`;
