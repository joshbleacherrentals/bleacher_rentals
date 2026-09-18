-- The "Event Requirements Not Met" alert no longer compares the legacy 7/10/15-row counts on
-- Events (requirements now come from bleacher-type line items). Delete the stored alerts the old
-- rule produced, e.g. "Bleacher mismatch — 15-row: 0 needed, 2 assigned.", so they stop showing
-- for events nobody re-opens.
--
-- The match is case-sensitive on purpose: legacy messages read "15-row: 2 needed", while current
-- messages use the bleacher type's name ("15-Row, 450 Seat: 2 needed"), so they never match.
-- UserAlerts has no ON DELETE CASCADE, so its rows go first.

WITH legacy AS (
  SELECT id
  FROM public."Alerts"
  WHERE title = 'Event Requirements Not Met'
    AND message ~ '(^|, |— )(7|10|15)-row: \d+ needed, \d+ assigned'
)
DELETE FROM public."UserAlerts"
WHERE alert_uuid IN (SELECT id FROM legacy);

DELETE FROM public."Alerts"
WHERE title = 'Event Requirements Not Met'
  AND message ~ '(^|, |— )(7|10|15)-row: \d+ needed, \d+ assigned';
