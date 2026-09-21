-- No alerts in the past — see docs/specs/no-past-alerts.md.
--
-- delete_past_alerts() removes every alert whose entity is over, plus alerts whose entity no longer
-- exists (or whose event is soft-deleted), together with their UserAlerts. "Today" is Toronto's
-- date. An event is past after its end date; a bleacher event goes with its event; a work tracker
-- is past after its date. A missing date is never treated as past.
--
-- It replaces the row-by-row loop in /api/cron/alerts, which read at most 1,000 alerts per run
-- (PostgREST max_rows) and issued one query per alert. The Vercel cron now calls this through rpc.
--
-- One statement: UserAlerts and Alerts are deleted by data-modifying CTEs over the same snapshot.
-- UserAlerts_alert_uuid_fkey is NO ACTION, which Postgres checks at the end of the statement, so the
-- order is safe.

CREATE OR REPLACE FUNCTION public.delete_past_alerts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today date := (now() AT TIME ZONE 'America/Toronto')::date;
  deleted_count integer;
BEGIN
  WITH stale AS (
    SELECT a.id
    FROM public."Alerts" a
    WHERE
      (a.entity_type = 'event' AND NOT EXISTS (
        SELECT 1 FROM public."Events" e
        WHERE e.id = a.entity_uuid
          AND NOT coalesce(e.deleted, false)
          AND (e.event_end IS NULL OR e.event_end >= today)
      ))
      OR (a.entity_type = 'bleacher_event' AND NOT EXISTS (
        SELECT 1 FROM public."BleacherEvents" be
        JOIN public."Events" e ON e.id = be.event_uuid
        WHERE be.id = a.entity_uuid
          AND NOT coalesce(e.deleted, false)
          AND (e.event_end IS NULL OR e.event_end >= today)
      ))
      OR (a.entity_type = 'work_tracker' AND NOT EXISTS (
        SELECT 1 FROM public."WorkTrackers" w
        WHERE w.id = a.entity_uuid
          AND (w.date IS NULL OR w.date >= today)
      ))
  ),
  deleted_user_alerts AS (
    DELETE FROM public."UserAlerts" ua
    WHERE ua.alert_uuid IN (SELECT id FROM stale)
  ),
  deleted_alerts AS (
    DELETE FROM public."Alerts" a
    WHERE a.id IN (SELECT id FROM stale)
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted_alerts;

  RETURN deleted_count;
END;
$$;

-- Only the server (the cron's service-role client) may run it.
REVOKE ALL ON FUNCTION public.delete_past_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_past_alerts() TO service_role;

-- One-off cleanup of everything already past.
SELECT public.delete_past_alerts();
