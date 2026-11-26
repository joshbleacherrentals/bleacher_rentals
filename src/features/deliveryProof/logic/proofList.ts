import type { WebRole } from "@/features/userAccess/logic/determineAccess";
import type { ProofStatus } from "./verdict";

/** A completed work tracker's proof on the Delivery Proof page; "unchecked" before the first check. */
export type ListStatus = ProofStatus | "unchecked";

/** Worst first: what needs someone to look comes before what is still pending or fine. */
export const PROOF_ORDER: ListStatus[] = [
  "not_found",
  "no_gps",
  "no_location",
  "waiting",
  "unchecked",
  "verified",
];

export const PROOF_LABEL: Record<ListStatus, string> = {
  not_found: "Not found",
  no_gps: "No GPS",
  no_location: "No location",
  waiting: "Waiting",
  unchecked: "Not checked yet",
  verified: "Verified",
};

export function listStatus(status: string | null | undefined): ListStatus {
  return (PROOF_ORDER as string[]).includes(status ?? "") ? (status as ListStatus) : "unchecked";
}

/** Worst status first, then the oldest completion first. Pure; returns a new array. */
export function sortWorstFirst<T extends { status: string | null; completed_at: string | null }>(
  rows: T[],
): T[] {
  const rank = (r: T) => PROOF_ORDER.indexOf(listStatus(r.status));
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || (a.completed_at ?? "").localeCompare(b.completed_at ?? ""),
  );
}

/** How many rows are in each status, every status present (0 when none). */
export function proofCounts(rows: { status: string | null }[]): Record<ListStatus, number> {
  const counts = Object.fromEntries(PROOF_ORDER.map((s) => [s, 0])) as Record<ListStatus, number>;
  for (const r of rows) counts[listStatus(r.status)]++;
  return counts;
}

/** Check now on the Delivery Proof page runs the GPS check at once: administrators and AMs. */
export function canCheckDeliveryNow(roles: readonly WebRole[]): boolean {
  return roles.includes("admin") || roles.includes("account_manager");
}
