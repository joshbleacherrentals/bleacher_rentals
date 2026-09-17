"use client";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type PsBleacherEventRow = {
  id: string;
  bleacher_uuid: string | null;
  event_uuid: string | null;
  setup_text: string | null;
  setup_confirmed: number | null;
  teardown_text: string | null;
  teardown_confirmed: number | null;
};

const compiled = db
  .selectFrom("BleacherEvents as be")
  .select([
    "be.id",
    "be.bleacher_uuid",
    "be.event_uuid",
    "be.setup_text",
    "be.setup_confirmed",
    "be.teardown_text",
    "be.teardown_confirmed",
  ])
  .compile();

/**
 * The full query result, including `isLoading`.
 *
 * `usePsBleacherEvents` collapses that to an array, which cannot tell "no rows yet"
 * from "no rows at all". Anything that draws a conclusion from emptiness — an
 * alert calculation, most of all, where an empty list reads as "no problems" —
 * must use this and wait.
 */
export function usePsBleacherEventsQuery() {
  return useTypedQuery(compiled, expect<PsBleacherEventRow>());
}

export function usePsBleacherEvents() {
  return usePsBleacherEventsQuery().data ?? [];
}
