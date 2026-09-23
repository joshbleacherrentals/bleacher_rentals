"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";

type Row = { default_sales_office_uuid: string | null };

/**
 * The logged-in user's own AccountManagers.default_sales_office_uuid — prefills the sales office
 * dropdown on a fresh quote. Null for admins/non-AMs, or when the AM has not set one.
 */
export function useCurrentAmDefaultSalesOffice(): string | null {
  const accountManagerId = usePermissionsStore((s) => s.accountManagerId);

  const compiled = useMemo(
    () =>
      db
        .selectFrom("AccountManagers")
        .select(["default_sales_office_uuid"])
        .where("id", "=", accountManagerId ?? "")
        .compile(),
    [accountManagerId],
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  return accountManagerId ? (data?.[0]?.default_sales_office_uuid ?? null) : null;
}
