"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import type { VenueFull } from "../types";

type Row = {
  id: string;
  name: string | null;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  country: string | null;
};

export function useVenuesAll(): { venues: VenueFull[]; isLoading: boolean } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Venues as v")
        .innerJoin("Addresses as a", "v.address_uuid", "a.id")
        .select([
          "v.id as id",
          "v.name as name",
          "a.street as street",
          "a.city as city",
          "a.state_province as state_province",
          "a.zip_postal as zip_postal",
          "a.latitude as latitude",
          "a.longitude as longitude",
          "a.place_id as place_id",
          "a.country as country",
        ])
        .where("v.deleted", "=", 0)
        .orderBy("v.name")
        .compile(),
    [],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<Row>());

  const venues = useMemo(
    () =>
      (data ?? []).map((r) => ({
        id: r.id,
        name: r.name ?? "",
        address: {
          street: r.street ?? "",
          city: r.city ?? "",
          stateProvince: r.state_province ?? "",
          zipPostal: r.zip_postal ?? "",
          lat: r.latitude ?? undefined,
          lng: r.longitude ?? undefined,
          placeId: r.place_id ?? undefined,
          country: r.country ?? undefined,
        },
      })),
    [data],
  );

  return { venues, isLoading };
}
