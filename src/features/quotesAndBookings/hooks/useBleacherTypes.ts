"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

type BleacherTypeRow = {
  id: string;
  name: string | null;
  row_count: number | null;
  description: string | null;
};

export type BleacherTypeOption = {
  id: string;
  name: string;
  rowCount: number;
  description: string | null;
};

export function mapBleacherTypeRow(r: BleacherTypeRow): BleacherTypeOption {
  return {
    id: r.id,
    name: r.name ?? "",
    rowCount: r.row_count ?? 0,
    description: r.description,
  };
}

export function useBleacherTypes(): { bleacherTypes: BleacherTypeOption[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("BleacherTypes")
        .select(["id", "name", "row_count", "description"])
        .where("deleted", "=", 0)
        .orderBy("row_count")
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<BleacherTypeRow>());

  const bleacherTypes = useMemo(() => (data ?? []).map(mapBleacherTypeRow), [data]);

  return { bleacherTypes, isLoading };
}
