"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  bleachersMatch,
  requiredBleachersByType,
  type RequiredBleacher,
} from "../utils/bleacherMatch";

type LineItemRow = {
  event_uuid: string | null;
  bleacher_type_uuid: string | null;
  bleacher_type_name: string | null;
  quantity: number | null;
};
type SelectedRow = {
  event_uuid: string | null;
  id: string;
  bleacher_number: number | null;
  bleacher_seats: number | null;
  bleacher_type_uuid: string | null;
  bleacher_type_name: string | null;
};

export type SelectedBleacher = {
  bleacherUuid: string;
  bleacherNumber: number | null;
  seats: number | null;
  typeId: string | null;
  typeName: string | null;
};

export type EventBleachers = {
  required: RequiredBleacher[];
  selected: SelectedBleacher[];
  /** Whether the bleachers selected are exactly what the line items require. */
  matches: boolean;
};

/**
 * The bleachers of several events at once, from the local database: what each requires (its line
 * items, by bleacher type) and what has been selected for it (its bleacher events). Keyed by event
 * id; an event with neither has an entry too.
 */
export function useEventsBleachers(eventIds: string[]): {
  byEvent: Map<string, EventBleachers>;
  isLoading: boolean;
} {
  const idsKey = eventIds.join(",");
  // `idsKey` stands in for the array so a new array with the same ids does not re-run the queries.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ids = useMemo(() => eventIds, [idsKey]);

  const compiledRequired = useMemo(
    () =>
      db
        .selectFrom("EventLineItems as li")
        .innerJoin("BleacherTypes as bt", "bt.id", "li.bleacher_type_uuid")
        .select([
          "li.event_uuid as event_uuid",
          "li.bleacher_type_uuid as bleacher_type_uuid",
          "bt.name as bleacher_type_name",
          "li.quantity as quantity",
        ])
        .where("li.event_uuid", "in", ids)
        .where("li.deleted", "=", 0)
        .compile(),
    [ids],
  );
  const { data: lineItems, isLoading: requiredLoading } = useTypedQuery(
    compiledRequired,
    expect<LineItemRow>(),
  );

  const compiledSelected = useMemo(
    () =>
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
        .leftJoin("BleacherTypes as bt", "bt.id", "b.bleacher_type_uuid")
        .select([
          "be.event_uuid as event_uuid",
          "b.id as id",
          "b.bleacher_number as bleacher_number",
          "b.bleacher_seats as bleacher_seats",
          "b.bleacher_type_uuid as bleacher_type_uuid",
          "bt.name as bleacher_type_name",
        ])
        .where("be.event_uuid", "in", ids)
        .where("b.deleted", "=", 0)
        .orderBy("b.bleacher_number", "asc")
        .compile(),
    [ids],
  );
  const { data: selectedRows, isLoading: selectedLoading } = useTypedQuery(
    compiledSelected,
    expect<SelectedRow>(),
  );

  const byEvent = useMemo(() => {
    const map = new Map<string, EventBleachers>();
    for (const id of ids) {
      const required = requiredBleachersByType(
        (lineItems ?? [])
          .filter((r) => r.event_uuid === id)
          .map((r) => ({
            bleacherTypeId: r.bleacher_type_uuid,
            bleacherTypeName: r.bleacher_type_name,
            quantity: r.quantity,
          })),
      );
      const selected = (selectedRows ?? [])
        .filter((r) => r.event_uuid === id)
        .map((r) => ({
          bleacherUuid: r.id,
          bleacherNumber: r.bleacher_number,
          seats: r.bleacher_seats,
          typeId: r.bleacher_type_uuid,
          typeName: r.bleacher_type_name,
        }));
      map.set(id, { required, selected, matches: bleachersMatch(required, selected) });
    }
    return map;
  }, [ids, lineItems, selectedRows]);

  return { byEvent, isLoading: requiredLoading || selectedLoading };
}
