"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

/**
 * Sales office names by id, for labels that store only the id (the applied
 * Sales Office filter chip). Deliberately just two columns: `useSalesOffices`
 * also resolves currencies, which costs an online QuickBooks fetch per caller.
 */
type Row = { id: string; name: string | null };

export function useSalesOfficeNames(): Map<string, string> {
  const compiled = useMemo(
    () => db.selectFrom("SalesOffices").select(["id", "name"]).compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  return useMemo(() => new Map((data ?? []).map((o) => [o.id, o.name ?? ""])), [data]);
}
