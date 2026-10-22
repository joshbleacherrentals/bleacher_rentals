"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { filterQuotesBookingsEvents } from "../utils/filterEvents";
import { QuotesBookingsEvent, QuotesBookingsFilters } from "../types";

/** What the list query returns: an event plus the website form submission, as one flat type. */
type Flat<T> = { [K in keyof T]: T[K] };
type ListRow = Flat<
  QuotesBookingsEvent & { lead_submission: string | null; hide_lead_alert: number | null }
>;
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { matchesInboundLeads, type InboundLeadsUser } from "../utils/inboundLeadsTemplate";
import { zoneOfEvent } from "../utils/zoneOfEvent";
import { useZoneByState } from "./useZoneLookup";

/**
 * `leadsRule` turns the My Inbound Leads template on for this person (null or left out: off). It
 * keeps only the rows the rule accepts, before the other filters.
 */
export function useQuotesAndBookingsData(
  filters: QuotesBookingsFilters,
  showDeleted = false,
  leadsRule: InboundLeadsUser | null = null,
) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const zoneByState = useZoneByState();

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
        "e.quote_sent_at as quote_sent_at",
        "e.created_by_user_uuid as created_by_user_uuid",
        "e.goodshuffle_url as goodshuffle_url",
        "e.is_qbo as is_qbo",
        "e.sales_office_uuid as sales_office_uuid",
        "e.deleted as deleted",
        "e.invoice_number as invoice_number",
        "e.lead_submission as lead_submission",
        "e.hide_lead_alert as hide_lead_alert",
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

  const { data, isLoading, error } = useTypedQuery(compiled, expect<ListRow>());

  const filtered = useMemo(() => {
    if (!data) return data;
    // The zone is worked out here, once per row, so the filter stays a plain comparison.
    const withZone = data.map((event) => ({
      ...event,
      zone_uuid: zoneOfEvent(event, zoneByState),
    }));
    const inTemplate = leadsRule
      ? withZone.filter((event) => matchesInboundLeads(event, leadsRule))
      : withZone;
    return filterQuotesBookingsEvents(inTemplate, filters, timezone);
  }, [data, filters, timezone, zoneByState, leadsRule]);

  return { data: filtered, isLoading, error };
}
