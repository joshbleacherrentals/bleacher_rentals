import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "../../../../../database.types";
import { Bleacher, BleacherEvent } from "../../types";
import { SwapDetail } from "../../state/useSwapStore";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";

/**
 * Check if two date ranges overlap.
 * Ranges are inclusive: [startA..endA] overlaps [startB..endB]
 */
function datesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  return startA <= endB && startB <= endA;
}

/**
 * Deep search to find all events affected by swapping between two bleachers.
 *
 * Starting with the current event on sourceBleacher, finds all cascading
 * overlaps that would result from the swap.
 *
 * @returns Array of SwapDetail describing each event move
 */
export function computeAffectedSwaps(
  sourceBleacherUuid: string,
  targetBleacherUuid: string,
  currentEventUuid: string,
  bleachers: Bleacher[],
): SwapDetail[] {
  const sourceBleacher = bleachers.find((b) => b.bleacherUuid === sourceBleacherUuid);
  const targetBleacher = bleachers.find((b) => b.bleacherUuid === targetBleacherUuid);
  if (!sourceBleacher || !targetBleacher) return [];

  // Events currently on source and target bleachers (keyed by eventUuid)
  const sourceEvents = new Map<string, BleacherEvent>();
  for (const ev of sourceBleacher.bleacherEvents) {
    sourceEvents.set(ev.eventUuid, ev);
  }
  const targetEvents = new Map<string, BleacherEvent>();
  for (const ev of targetBleacher.bleacherEvents) {
    targetEvents.set(ev.eventUuid, ev);
  }

  // Track which events are moving in each direction
  // source -> target
  const movingToTarget = new Set<string>();
  // target -> source
  const movingToSource = new Set<string>();

  // Seed: current event moves from source to target
  const currentEvent = sourceEvents.get(currentEventUuid);
  if (!currentEvent) return [];
  movingToTarget.add(currentEventUuid);

  // Fixed-point iteration: keep finding new overlaps
  let changed = true;
  while (changed) {
    changed = false;

    // Events moving to target: check for overlaps with target's existing events
    // (excluding events already moving to source)
    for (const evUuid of movingToTarget) {
      const ev = sourceEvents.get(evUuid);
      if (!ev) continue;

      for (const [tEvUuid, tEv] of targetEvents) {
        if (movingToSource.has(tEvUuid)) continue; // already accounted for
        if (datesOverlap(ev.eventStart, ev.eventEnd, tEv.eventStart, tEv.eventEnd)) {
          movingToSource.add(tEvUuid);
          changed = true;
        }
      }
    }

    // Events moving to source: check for overlaps with source's existing events
    // (excluding events already moving to target)
    for (const evUuid of movingToSource) {
      const ev = targetEvents.get(evUuid);
      if (!ev) continue;

      for (const [sEvUuid, sEv] of sourceEvents) {
        if (movingToTarget.has(sEvUuid)) continue; // already accounted for
        if (datesOverlap(ev.eventStart, ev.eventEnd, sEv.eventStart, sEv.eventEnd)) {
          movingToTarget.add(sEvUuid);
          changed = true;
        }
      }
    }
  }

  // Build swap details
  const swaps: SwapDetail[] = [];

  for (const evUuid of movingToTarget) {
    const ev = sourceEvents.get(evUuid)!;
    swaps.push({
      eventUuid: ev.eventUuid,
      eventName: ev.eventName,
      fromBleacherUuid: sourceBleacherUuid,
      fromBleacherNumber: sourceBleacher.bleacherNumber,
      toBleacherUuid: targetBleacherUuid,
      toBleacherNumber: targetBleacher.bleacherNumber,
    });
  }

  for (const evUuid of movingToSource) {
    const ev = targetEvents.get(evUuid)!;
    swaps.push({
      eventUuid: ev.eventUuid,
      eventName: ev.eventName,
      fromBleacherUuid: targetBleacherUuid,
      fromBleacherNumber: targetBleacher.bleacherNumber,
      toBleacherUuid: sourceBleacherUuid,
      toBleacherNumber: sourceBleacher.bleacherNumber,
    });
  }

  return swaps;
}

/**
 * Execute the swap in the database.
 * Deletes all affected BleacherEvents first, then inserts new ones.
 */
export async function executeSwap(
  swaps: SwapDetail[],
  supabase: SupabaseClient<Database>,
): Promise<void> {
  if (!supabase) {
    createErrorToast(["No Supabase Client found"]);
    throw new Error("No Supabase Client found");
  }

  if (swaps.length === 0) {
    createErrorToast(["No swaps to execute"]);
    throw new Error("No swaps to execute");
  }

  // Phase 1: Delete all affected BleacherEvents rows
  for (const swap of swaps) {
    const { error } = await supabase
      .from("BleacherEvents")
      .delete()
      .eq("event_uuid", swap.eventUuid)
      .eq("bleacher_uuid", swap.fromBleacherUuid);

    if (error) {
      createErrorToast([
        `Failed to remove ${swap.eventName} from Bleacher #${swap.fromBleacherNumber}`,
        error?.message ?? "",
      ]);
      throw new Error(`Swap failed during delete phase: ${error?.message}`);
    }
  }

  // Phase 2: Insert new BleacherEvents rows
  for (const swap of swaps) {
    const { error } = await supabase.from("BleacherEvents").insert({
      event_uuid: swap.eventUuid,
      bleacher_uuid: swap.toBleacherUuid,
      setup_text: "",
      setup_confirmed: false,
      teardown_text: "",
      teardown_confirmed: false,
    });

    if (error) {
      createErrorToast([
        `Failed to assign ${swap.eventName} to Bleacher #${swap.toBleacherNumber}`,
        error?.message ?? "",
      ]);
      throw new Error(`Swap failed during insert phase: ${error?.message}`);
    }
  }

  createSuccessToast(["Bleacher swap completed successfully"]);
}
