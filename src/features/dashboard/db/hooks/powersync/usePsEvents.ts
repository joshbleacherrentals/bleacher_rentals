"use client";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type PsEventRow = {
  id: string;
  event_name: string | null;
  event_start: string | null;
  event_end: string | null;
  setup_start: string | null;
  teardown_end: string | null;
  hsl_hue: number | null;
  event_status: string | null;
  goodshuffle_url: string | null;
  lenient: number | null;
  notes: string | null;
  total_seats: number | null;
  seven_row: number | null;
  ten_row: number | null;
  fifteen_row: number | null;
  must_be_clean: number | null;
  address_uuid: string | null;
  created_by_user_uuid: string | null;
  contract_revenue_cents: number | null;
  deleted: number | null;
};

const compiled = db
  .selectFrom("Events as e")
  .select([
    "e.id",
    "e.event_name",
    "e.event_start",
    "e.event_end",
    "e.setup_start",
    "e.teardown_end",
    "e.hsl_hue",
    "e.event_status",
    "e.goodshuffle_url",
    "e.lenient",
    "e.notes",
    "e.total_seats",
    "e.seven_row",
    "e.ten_row",
    "e.fifteen_row",
    "e.must_be_clean",
    "e.address_uuid",
    "e.created_by_user_uuid",
    "e.contract_revenue_cents",
    "e.deleted",
  ])
  .where("e.deleted", "=", 0)
  .where("e.event_status", "!=", "lost")
  .compile();

/**
 * The full query result, including `isLoading`.
 *
 * `usePsEvents` collapses that to an array, which cannot tell "no rows yet"
 * from "no rows at all". Anything that draws a conclusion from emptiness — an
 * alert calculation, most of all, where an empty list reads as "no problems" —
 * must use this and wait.
 */
export function usePsEventsQuery() {
  return useTypedQuery(compiled, expect<PsEventRow>());
}

export function usePsEvents() {
  return usePsEventsQuery().data ?? [];
}
