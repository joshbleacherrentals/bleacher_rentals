"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { storedToActivityEmail, type ActivityEmail } from "../logic/emailActivity";

type Row = {
  id: string;
  from_address: string | null;
  to_addresses: string | null;
  subject: string | null;
  date: string | null;
  snippet: string | null;
  direction: string | null;
};

/** The emails already saved for a contact (EmailMessages linked through ContactEmailMessages), newest first. */
export function useContactEmailMessages(contactUuid: string): {
  emails: ActivityEmail[];
  isLoading: boolean;
} {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("ContactEmailMessages as cem")
        .innerJoin("EmailMessages as em", "em.id", "cem.email_message_uuid")
        .select([
          "em.id as id",
          "em.from_address as from_address",
          "em.to_addresses as to_addresses",
          "em.subject as subject",
          "em.date as date",
          "em.snippet as snippet",
          "em.direction as direction",
        ])
        .where("cem.contact_uuid", "=", contactUuid)
        .orderBy("em.date", "desc")
        .compile(),
    [contactUuid],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const emails = useMemo(() => (data ?? []).map(storedToActivityEmail), [data]);
  return { emails, isLoading };
}
