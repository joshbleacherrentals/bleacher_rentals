"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { contactDisplayName, type DirectoryContact } from "../logic/recipientList";

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

/**
 * Every contact that has an email address (soft-deleted ones left out), read from the local
 * database: the people the "To" field of a reply can suggest, and whose names it shows.
 */
export function useContactDirectory(): DirectoryContact[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Contacts")
        .select(["id", "first_name", "last_name", "email"])
        .where("deleted", "=", 0)
        .where("email", "is not", null)
        .compile(),
    [],
  );
  const { data } = useTypedQuery(compiled, expect<Row>());

  return useMemo(
    () =>
      (data ?? []).flatMap((row) =>
        row.email?.trim()
          ? [
              {
                id: row.id,
                name: contactDisplayName(row.first_name, row.last_name),
                email: row.email.trim(),
              },
            ]
          : [],
      ),
    [data],
  );
}
