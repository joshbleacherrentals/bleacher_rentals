-- Counts for comparing data before / after the first-installment-on-signing migration.
-- Events: deleted = false only. Days are America/Toronto.
-- First installment = the due_on_signing row, else the earliest due_date (NULL last), created_at, id
--   (before the migration no row is marked; after it the marked row is the first one and may have no date).
-- NULL-safe equality: an event with no signature has sign_day NULL, which must not hide a mismatch.
-- sign_day = day of the earliest signature of any status. booked_day = Events.booked_at.
-- past = first_due < today, future = first_due >= today.
WITH ev AS (
  SELECT e.id, e.event_status,
         (SELECT min(s.signed_at) FROM "ContractSignatures" s WHERE s.event_uuid = e.id)
           AT TIME ZONE 'America/Toronto' AS sign_ts,
         e.booked_at AT TIME ZONE 'America/Toronto' AS booked_ts
  FROM "Events" e
  WHERE e.deleted = false
), first_pi AS (
  SELECT DISTINCT ON (event_uuid) event_uuid, due_date
  FROM "PaymentInstallments"
  ORDER BY event_uuid, due_on_signing DESC, due_date NULLS LAST, created_at, id
), x AS (
  SELECT ev.*, f.due_date AS first_due,
         (f.event_uuid IS NOT NULL) AS has_schedule,
         ev.sign_ts::date AS sign_day, ev.booked_ts::date AS booked_day,
         (COALESCE(f.due_date = ev.sign_ts::date, false) OR COALESCE(f.due_date = ev.booked_ts::date, false)) AS matches
  FROM ev LEFT JOIN first_pi f ON f.event_uuid = ev.id
), today AS (SELECT (now() AT TIME ZONE 'America/Toronto')::date AS d)
SELECT
  count(*) FILTER (WHERE NOT has_schedule)                                              AS "1_no_schedule",
  count(*) FILTER (WHERE has_schedule)                                                  AS "2_with_schedule",
  count(*) FILTER (WHERE has_schedule AND first_due <  d AND NOT matches)               AS "3_past_not_equal",
  count(*) FILTER (WHERE has_schedule AND first_due >= d AND NOT matches)               AS "4_future_not_equal",
  count(*) FILTER (WHERE has_schedule AND matches)                                      AS "5_equal_any_time",
  count(*) FILTER (WHERE has_schedule AND sign_ts IS NOT NULL AND first_due > sign_day) AS "6_signed_first_after_sign",
  count(*) FILTER (WHERE has_schedule AND sign_ts IS NULL
                     AND event_status IN ('booked','unsigned_changes')
                     AND first_due > booked_day)                                        AS "7_booked_unsigned_first_after_booked"
FROM x, today;
