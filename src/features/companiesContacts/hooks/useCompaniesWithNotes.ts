"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  indexCompanyNotes,
  type CompanyNoteInfo,
} from "@/features/quotesAndBookings/utils/clientNotes";

type Row = {
  id: string;
  company_name: string | null;
  notes: string | null;
};

// Just the id, name and notes of each company — useCompaniesAll also joins both addresses,
// which is far more than a caller that only wants to show a note needs. Reactive, so editing a
// company's notes on the Companies & Contacts page shows up wherever this is used.
export function useCompaniesWithNotes(): Map<string, CompanyNoteInfo> {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Companies")
        .select(["id", "company_name", "notes"])
        .where("deleted", "=", 0)
        .where("notes", "is not", null)
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  return useMemo(
    () =>
      indexCompanyNotes(
        (data ?? []).map((c) => ({ id: c.id, name: c.company_name ?? "", notes: c.notes })),
      ),
    [data],
  );
}
