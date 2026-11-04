"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

type Row = {
  id: string;
  email: string | null;
  created_at: string | null;
  created_by_user_uuid: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type BlockedEmailRow = {
  id: string;
  email: string;
  createdAt: string | null;
  createdByUserUuid: string | null;
  /** Who added it: "Pat Smith", or "" when that user is not known here. */
  createdByName: string;
};

/** Every blocked customer email, alphabetically, with the name of the person who added it. */
export function useBlockedCustomerEmails(): { rows: BlockedEmailRow[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("BlockedCustomerEmails as b")
        .leftJoin("Users as u", "u.id", "b.created_by_user_uuid")
        .select([
          "b.id as id",
          "b.email as email",
          "b.created_at as created_at",
          "b.created_by_user_uuid as created_by_user_uuid",
          "u.first_name as first_name",
          "u.last_name as last_name",
        ])
        .orderBy("b.email")
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const rows = useMemo(
    () =>
      (data ?? []).map(
        (row): BlockedEmailRow => ({
          id: row.id,
          email: row.email ?? "",
          createdAt: row.created_at,
          createdByUserUuid: row.created_by_user_uuid,
          createdByName: [row.first_name, row.last_name].filter(Boolean).join(" "),
        }),
      ),
    [data],
  );

  return { rows, isLoading };
}
