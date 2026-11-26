"use client";

import { sql } from "@powersync/kysely-driver";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import { vendorRecordFromRow, type VendorOption, type VendorRow } from "../utils/vendorForm";

type DriverCountRow = {
  vendor_uuid: string | null;
  count: string;
};

export type { VendorOption } from "../utils/vendorForm";

/**
 * Hook to fetch all vendors with driver counts using PowerSync.
 *
 * Each vendor comes whole (docs/specs/vendors-page.md §4.3): its type, contact, services, status
 * and notes, and its address joined from `Addresses`. Ordered by `display_name`, as before; the
 * Vendors page sorts again itself.
 */
export function useVendors(includeInactive: boolean = false) {
  // Build vendor query
  const vendorQuery = useMemo(() => {
    let query = db
      .selectFrom("Vendors")
      .leftJoin("Addresses", "Addresses.id", "Vendors.address_uuid")
      .select([
        "Vendors.id",
        "Vendors.display_name",
        "Vendors.type",
        "Vendors.logo_url",
        "Vendors.qbo_vendor_id",
        "Vendors.qbo_connection_uuid",
        "Vendors.is_active",
        "Vendors.ein",
        "Vendors.hst",
        "Vendors.status",
        "Vendors.phone",
        "Vendors.contact_name",
        "Vendors.contact_email",
        "Vendors.does_trailer_repair",
        "Vendors.does_aluminum_welding",
        "Vendors.does_mobile_repair",
        "Vendors.is_parts_supplier",
        "Vendors.notes",
        "Vendors.address_uuid",
        "Addresses.street as address_street",
        "Addresses.city as address_city",
        "Addresses.state_province as address_state_province",
        "Addresses.zip_postal as address_zip_postal",
        "Addresses.country as address_country",
        "Addresses.latitude as address_latitude",
        "Addresses.longitude as address_longitude",
        "Addresses.place_id as address_place_id",
      ])
      .orderBy("Vendors.display_name", "asc");

    if (!includeInactive) {
      query = query.where("Vendors.is_active", "=", 1);
    }

    return query.compile();
  }, [includeInactive]);

  // Build driver count query
  const driverCountQuery = useMemo(() => {
    return db
      .selectFrom("Drivers")
      .select(["vendor_uuid", sql<string>`count(id)`.as("count")])
      .where("vendor_uuid", "is not", null)
      .groupBy("vendor_uuid")
      .compile();
  }, []);

  const { data: vendors = [] } = useTypedQuery(vendorQuery, expect<VendorRow>());
  const { data: driverCounts = [] } = useTypedQuery(driverCountQuery, expect<DriverCountRow>());

  // Create a map of vendor_uuid -> driver count
  const driverCountMap = useMemo(() => {
    const map = new Map<string, number>();
    driverCounts.forEach((row) => {
      if (row.vendor_uuid) {
        map.set(row.vendor_uuid, parseInt(row.count, 10));
      }
    });
    return map;
  }, [driverCounts]);

  // Combine vendors with their driver counts
  const vendorList: VendorOption[] = useMemo(() => {
    return vendors.map((v) => ({
      ...vendorRecordFromRow(v),
      driverCount: driverCountMap.get(v.id) || 0,
    }));
  }, [vendors, driverCountMap]);

  return { data: vendorList, isLoading: false };
}
