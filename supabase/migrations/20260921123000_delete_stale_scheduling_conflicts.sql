-- One-off: delete "Scheduling Conflict" alerts that no longer describe a real double booking.
--
-- An alert is only rewritten when something saves the entity it hangs off, and until now the
-- ripple that follows a save read the event's bleachers AFTER the save. Taking a bleacher off an
-- event therefore left its neighbours holding a conflict with an event that had given the bleacher
-- up, with nothing to ever re-check them. The ripple is fixed (it now carries the removed
-- bleachers, and bounds on event_end so events under way are included), but the alerts it already
-- stranded have to be cleared once.
--
-- The predicate mirrors schedulingConflict.evaluate: the owning event must be booked and not
-- deleted, and some OTHER bleacher event on the same bleacher — also booked and not deleted — must
-- overlap it. The occupied window runs setup_start (or event_start) to teardown_end (or
-- event_end), and touching at the boundary counts as an overlap, exactly as the inclusive
-- comparison in the definition does.
--
-- UserAlerts has no ON DELETE CASCADE, so its rows go in the same statement's first CTE.

WITH stale AS (
  SELECT a.id
  FROM public."Alerts" a
  JOIN public."BleacherEvents" be ON be.id = a.entity_uuid
  JOIN public."Events" e ON e.id = be.event_uuid
  WHERE a.title = 'Scheduling Conflict'
    AND NOT EXISTS (
      SELECT 1
      FROM public."BleacherEvents" be2
      JOIN public."Events" e2 ON e2.id = be2.event_uuid
      WHERE be2.bleacher_uuid = be.bleacher_uuid
        AND be2.id <> be.id
        AND e2.event_status = 'booked'
        AND NOT coalesce(e2.deleted, false)
        AND NOT coalesce(e.deleted, false)
        AND e.event_status = 'booked'
        AND coalesce(e2.setup_start, e2.event_start)
              <= coalesce(e.teardown_end, e.event_end)
        AND coalesce(e2.teardown_end, e2.event_end)
              >= coalesce(e.setup_start, e.event_start)
    )
),
deleted_user_alerts AS (
  DELETE FROM public."UserAlerts" ua
  WHERE ua.alert_uuid IN (SELECT id FROM stale)
)
DELETE FROM public."Alerts" a
WHERE a.id IN (SELECT id FROM stale);
