"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { filterQuotesBookingsEvents } from "../utils/filterEvents";
import { QuotesBookingsEvent, QuotesBookingsFilters } from "../types";
import { useTimezoneStore } from "@/lib/useTimezoneStore";

export function useQuotesAndBookingsData(filters: QuotesBookingsFilters, showDeleted = false) {
  const timezone = useTimezoneStore((s) => s.timezone);

  const compiled = useMemo(() => {
    let query = db
      .selectFrom("Events as e")
      .leftJoin("Users as u", "e.created_by_user_uuid", "u.id")
      .leftJoin("Addresses as a", "e.address_uuid", "a.id")
      .leftJoin("Contacts as ct", "e.contact_uuid", "ct.id")
      .leftJoin("Companies as co", "ct.company_uuid", "co.id")
      .select([
        "e.id as id",
        "e.event_name as event_name",
        "e.event_start as event_start",
        "e.event_end as event_end",
        "e.event_status as event_status",
        "e.contract_revenue_cents as contract_revenue_cents",
        "e.tax_amount_cents as tax_amount_cents",
        "e.tax_percent as tax_percent",
        "e.created_at as created_at",
        "e.booked_at as booked_at",
        "e.created_by_user_uuid as created_by_user_uuid",
        "e.goodshuffle_url as goodshuffle_url",
        "e.is_qbo as is_qbo",
        "e.sales_office_uuid as sales_office_uuid",
        "e.deleted as deleted",
        "e.invoice_number as invoice_number",
        "u.first_name as account_manager_first_name",
        "u.last_name as account_manager_last_name",
        "u.email as account_manager_email",
        "a.street as address_street",
        "a.city as address_city",
        "a.state_province as address_state",
        "ct.first_name as contact_first_name",
        "ct.last_name as contact_last_name",
        "ct.email as contact_email",
        "co.company_name as company_name",
      ]);

    if (showDeleted) {
      query = query.where("e.deleted", "=", 1);
    } else {
      query = query.where("e.deleted", "=", 0);
    }

    return query.orderBy("e.created_at", "desc").compile();
  }, [showDeleted]);

  const { data, isLoading, error } = useTypedQuery(compiled, expect<QuotesBookingsEvent>());

  const filtered = useMemo(() => {
    if (!data) return data;
    return filterQuotesBookingsEvents(data, filters, timezone);
  }, [data, filters, timezone]);

  return { data: filtered, isLoading, error };
}
