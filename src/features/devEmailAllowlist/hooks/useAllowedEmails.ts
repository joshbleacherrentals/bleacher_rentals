"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type AllowedEmailRow = {
  id: string;
  email: string | null;
  created_at: string | null;
};

/** Every address on the development email allowlist, alphabetically. */
export function useAllowedEmails(): { rows: AllowedEmailRow[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("DevAllowedEmails")
        .select(["id", "email", "created_at"])
        .orderBy("email")
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<AllowedEmailRow>());
  return { rows: data ?? [], isLoading };
}
