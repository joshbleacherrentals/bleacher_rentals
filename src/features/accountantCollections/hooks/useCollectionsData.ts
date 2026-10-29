"use client";

import { useMemo } from "react";
import { sql } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useOfficeCurrencies } from "@/features/quotesAndBookings/hooks/useOfficeCurrencies";
import { useToday } from "@/features/quotesAndBookings/hooks/useToday";
import { pickEventCurrency } from "@/features/quotesAndBookings/utils/eventCurrency";
import type {
  EventLineTotalRow,
  ReceivableInstallmentRow,
  ReceivablePaymentRow,
} from "@/features/quotesAndBookings/utils/accountsReceivable";
import {
  buildCollectionsRows,
  type CollectionsRow,
  type CollectionsTaskSource,
} from "../utils/collectionsRows";

/**
 * The rows of the Collections list: the open tasks of booked, non-deleted events, each with the
 * Amount Due and the days overdue of the TypeScript twin.
 * docs/specs/accountant-collections-07-collections-list.md §3.
 *
 * Four queries, no more (docs/specs/slow-local-db-step1-split-watchers.md): the tasks joined to
 * their events, and the line totals, installments and payments of the events that have an open
 * task. The three narrow ones are not limited to booked events, so a task whose event is hidden
 * costs three rows' worth of reading, not a join.
 */

export function useCollectionsData(): {
  rows: CollectionsRow[];
  isLoading: boolean;
  error: Error | undefined;
  today: string;
} {
  const timezone = useTimezoneStore((s) => s.timezone);
  // Rolls over at midnight, so a list left open moves the next day's tasks into view.
  const today = useToday(timezone);
  // Not waited for: it includes an online-only fetch, and the list is local-first. Until it lands
  // an event is priced on its office's province, then USD — the AR tabs do the same.
  const { currencyByOfficeId } = useOfficeCurrencies();

  const tasksCompiled = useMemo(
    () =>
      db
        .selectFrom("ArEventTasks as t")
        .innerJoin("Events as e", "e.id", "t.event_uuid")
        .select([
          "t.id as task_id",
          "t.created_at as created_at",
          "t.due_date as due_date",
          "t.note as note",
          "e.id as event_uuid",
          "e.event_name as event_name",
          "e.event_start as event_start",
          "e.booked_at as booked_at",
          "e.tax_percent as tax_percent",
          "e.tax_amount_cents as tax_amount_cents",
          "e.sales_office_uuid as sales_office_uuid",
        ])
        .where("t.completed", "=", 0)
        .where("e.event_status", "=", "booked")
        .where("e.deleted", "=", 0)
        .compile(),
    [],
  );

  const lineTotalsCompiled = useMemo(
    () =>
      db
        .selectFrom("EventLineItems")
        .select([
          "event_uuid",
          sql<number>`sum(coalesce(${sql.ref("quantity")}, 1) * coalesce(${sql.ref("value_cents")}, 0))`.as(
            "line_total_cents",
          ),
        ])
        .where("deleted", "=", 0)
        .where("event_uuid", "in", (eb) =>
          eb.selectFrom("ArEventTasks").select("event_uuid").where("completed", "=", 0),
        )
        .groupBy("event_uuid")
        .compile(),
    [],
  );

  const installmentsCompiled = useMemo(
    () =>
      db
        .selectFrom("PaymentInstallments")
        .select(["id", "event_uuid", "due_date", "percentage_bps"])
        .where("event_uuid", "in", (eb) =>
          eb.selectFrom("ArEventTasks").select("event_uuid").where("completed", "=", 0),
        )
        .compile(),
    [],
  );

  const paymentsCompiled = useMemo(
    () =>
      db
        .selectFrom("PaymentHistory")
        .select([
          "id",
          "event_uuid",
          "installment_id",
          "amount_cents",
          "currency",
          "status",
          "paid_at",
          "created_at",
          "deleted_at",
        ])
        .where("event_uuid", "in", (eb) =>
          eb.selectFrom("ArEventTasks").select("event_uuid").where("completed", "=", 0),
        )
        .compile(),
    [],
  );

  const tasks = useTypedQuery(tasksCompiled, expect<CollectionsTaskSource>());
  const lineTotals = useTypedQuery(lineTotalsCompiled, expect<EventLineTotalRow>());
  const installments = useTypedQuery(installmentsCompiled, expect<ReceivableInstallmentRow>());
  const payments = useTypedQuery(paymentsCompiled, expect<ReceivablePaymentRow>());

  const isLoading =
    tasks.isLoading || lineTotals.isLoading || installments.isLoading || payments.isLoading;
  const error = tasks.error ?? lineTotals.error ?? installments.error ?? payments.error;

  const rows = useMemo(() => {
    if (isLoading) return [];
    return buildCollectionsRows(
      {
        tasks: tasks.data ?? [],
        lineTotals: lineTotals.data ?? [],
        installments: installments.data ?? [],
        payments: payments.data ?? [],
      },
      today,
      (task) => pickEventCurrency(task.sales_office_uuid, currencyByOfficeId),
    );
  }, [
    isLoading,
    tasks.data,
    lineTotals.data,
    installments.data,
    payments.data,
    today,
    currencyByOfficeId,
  ]);

  return { rows, isLoading, error, today };
}
