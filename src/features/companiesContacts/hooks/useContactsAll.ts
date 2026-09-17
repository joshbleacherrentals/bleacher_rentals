"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import type { AddressFields } from "@/features/quotesAndBookings/types/quoteTypes";
import type { VenueFull } from "@/features/venues/types";
import { toPreferredLanguage, type PreferredLanguage } from "../db/preferredLanguage";
import { storedAddressFrom, type AddressColumns, type Flat } from "../logic/address";
import type { ContactFormSource } from "../logic/contactForm";

export type ContactCompany = {
  companyName: string;
  email: string | null;
  phone: string | null;
  billingAddress: AddressFields | null;
  shippingAddress: AddressFields | null;
};

export type ContactFull = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  companyUuid: string | null;
  company: ContactCompany | null;
  preferredLanguage: PreferredLanguage;
  defaultVenue: VenueFull | null;
};

type Row = Flat<
  {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
    company_uuid: string | null;
    preferred_language: string | null;
    default_venue_uuid: string | null;
    company_id: string | null;
    company_name: string | null;
    company_email: string | null;
    company_phone: string | null;
    venue_id: string | null;
    venue_name: string | null;
  } & AddressColumns<"billing_"> &
    AddressColumns<"shipping_"> &
    AddressColumns<"venue_addr_">
>;

/** The fields the shared Contact form seeds from. */
export function contactFormSourceOf(c: ContactFull): ContactFormSource & { id: string } {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    notes: c.notes,
    companyUuid: c.companyUuid,
    preferredLanguage: c.preferredLanguage,
    defaultVenueId: c.defaultVenue?.id ?? null,
  };
}

export function useContactsAll(): { contacts: ContactFull[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Contacts as c")
        // Soft-deleted companies and venues read as absent, same as their own lists.
        .leftJoin("Companies as co", (join) =>
          join.onRef("co.id", "=", "c.company_uuid").on("co.deleted", "=", 0),
        )
        .leftJoin("Addresses as b", "b.id", "co.billing_address_uuid")
        .leftJoin("Addresses as s", "s.id", "co.shipping_address_uuid")
        .leftJoin("Venues as v", (join) =>
          join.onRef("v.id", "=", "c.default_venue_uuid").on("v.deleted", "=", 0),
        )
        .leftJoin("Addresses as va", "va.id", "v.address_uuid")
        .select([
          "c.id as id",
          "c.first_name as first_name",
          "c.last_name as last_name",
          "c.email as email",
          "c.phone as phone",
          "c.notes as notes",
          "c.company_uuid as company_uuid",
          "c.preferred_language as preferred_language",
          "c.default_venue_uuid as default_venue_uuid",
          "co.id as company_id",
          "co.company_name as company_name",
          "co.email as company_email",
          "co.phone as company_phone",
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
          "v.id as venue_id",
          "v.name as venue_name",
          "va.id as venue_addr_id",
          "va.street as venue_addr_street",
          "va.city as venue_addr_city",
          "va.state_province as venue_addr_state_province",
          "va.zip_postal as venue_addr_zip_postal",
          "va.latitude as venue_addr_latitude",
          "va.longitude as venue_addr_longitude",
          "va.place_id as venue_addr_place_id",
          "va.country as venue_addr_country",
        ])
        .where("c.deleted", "=", 0)
        .orderBy("c.first_name")
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const contacts = useMemo(
    () =>
      (data ?? []).map((c): ContactFull => {
        const venueAddress = storedAddressFrom(c, "venue_addr_");
        return {
          id: c.id,
          firstName: c.first_name ?? "",
          lastName: c.last_name,
          email: c.email,
          phone: c.phone,
          notes: c.notes,
          companyUuid: c.company_uuid,
          company: c.company_id
            ? {
                companyName: c.company_name ?? "",
                email: c.company_email,
                phone: c.company_phone,
                billingAddress: storedAddressFrom(c, "billing_"),
                shippingAddress: storedAddressFrom(c, "shipping_"),
              }
            : null,
          preferredLanguage: toPreferredLanguage(c.preferred_language),
          defaultVenue:
            c.venue_id && venueAddress
              ? { id: c.venue_id, name: c.venue_name ?? "", address: venueAddress }
              : null,
        };
      }),
    [data],
  );

  return { contacts, isLoading };
}
