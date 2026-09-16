"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import {
  storedAddressFrom,
  type AddressColumns,
  type Flat,
  type StoredAddress,
} from "../logic/address";

export type { StoredAddress } from "../logic/address";

export type CompanyFull = {
  id: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  billingAddress: StoredAddress | null;
  shippingAddress: StoredAddress | null;
};

type Row = Flat<
  {
    id: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  } & AddressColumns<"billing_"> &
    AddressColumns<"shipping_">
>;

export function useCompaniesAll(): { companies: CompanyFull[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Companies as c")
        .leftJoin("Addresses as b", "b.id", "c.billing_address_uuid")
        .leftJoin("Addresses as s", "s.id", "c.shipping_address_uuid")
        .select([
          "c.id as id",
          "c.company_name as company_name",
          "c.email as email",
          "c.phone as phone",
          "c.notes as notes",
          "b.id as billing_id",
          "b.street as billing_street",
          "b.city as billing_city",
          "b.state_province as billing_state_province",
          "b.zip_postal as billing_zip_postal",
          "b.latitude as billing_latitude",
          "b.longitude as billing_longitude",
          "b.place_id as billing_place_id",
          "b.country as billing_country",
          "s.id as shipping_id",
          "s.street as shipping_street",
          "s.city as shipping_city",
          "s.state_province as shipping_state_province",
          "s.zip_postal as shipping_zip_postal",
          "s.latitude as shipping_latitude",
          "s.longitude as shipping_longitude",
          "s.place_id as shipping_place_id",
          "s.country as shipping_country",
        ])
        .where("c.deleted", "=", 0)
        .orderBy("c.company_name")
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const companies = useMemo(
    () =>
      (data ?? []).map((c) => ({
        id: c.id,
        companyName: c.company_name ?? "",
        email: c.email,
        phone: c.phone,
        notes: c.notes,
        billingAddress: storedAddressFrom(c, "billing_"),
        shippingAddress: storedAddressFrom(c, "shipping_"),
      })),
    [data],
  );

  return { companies, isLoading };
}
