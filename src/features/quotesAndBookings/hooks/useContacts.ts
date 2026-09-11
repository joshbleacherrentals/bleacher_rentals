"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type ContactRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_uuid: string | null;
  default_venue_uuid: string | null;
};

export type ContactOption = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyUuid: string | null;
  defaultVenueId: string | null;
};

export function useContacts(): { contacts: ContactOption[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Contacts")
        .select([
          "id",
          "first_name",
          "last_name",
          "email",
          "phone",
          "company_uuid",
          "default_venue_uuid",
        ])
        .where("deleted", "=", 0)
        .orderBy("first_name")
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<ContactRow>());

  const contacts = useMemo(
    () =>
      (data ?? []).map((c) => ({
        id: c.id,
        firstName: c.first_name ?? "",
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        companyUuid: c.company_uuid,
        defaultVenueId: c.default_venue_uuid,
      })),
    [data],
  );

  return { contacts, isLoading };
}
