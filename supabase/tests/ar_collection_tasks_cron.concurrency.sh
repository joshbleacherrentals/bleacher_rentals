#!/usr/bin/env bash
# ============================================================================
# Concurrency check for create_ar_collection_tasks()
#
# Two sessions run the daily job at the same moment. Both read "no open task" for the same events
# before either commits, so both try to insert. Without the conflict clause on the partial unique
# index (one open task per event), the second session fails with a unique violation (23505) once
# the first commits. With it, the second waits for the first, does nothing, and neither errors.
#
# Session 1: BEGIN; SELECT create_ar_collection_tasks(); pg_sleep(2); COMMIT;
# Session 2 (starts ~1s in, mid-sleep): BEGIN; SELECT create_ar_collection_tasks(); COMMIT;
# Session 3 (after both finish): every fixture event has exactly one open task, and the two
#   sessions made 3 tasks between them (not 6, not 0).
#
# The job looks at EVERY booked event in the database. To count only the fixtures, the script first
# gives every booked event that already exists an open "concurrency baseline" task, and removes
# those, and everything the job made, in its cleanup. Do not point it at a database that matters.
#
# Usage:
#   ./ar_collection_tasks_cron.concurrency.sh
#
# Requires `psql` on PATH and a local Supabase Postgres on the usual local port (override with
# DB_URL). Requires 20261028130000_ar_amount_due.sql and 20261028140000_ar_collection_tasks_cron.sql
# to be applied.
# ============================================================================

set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# Fixed, namespaced UUIDs so repeat runs are trivially idempotent.
EVENT_A="c0ffee04-0000-4000-8000-0000000000a1"
EVENT_B="c0ffee04-0000-4000-8000-0000000000b2"
EVENT_C="c0ffee04-0000-4000-8000-0000000000c3"
FIXTURES="'${EVENT_A}', '${EVENT_B}', '${EVENT_C}'"
BASELINE_NOTE="concurrency baseline"
SYSTEM_NOTE="Remind the customer about payment"

cleanup() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
    DELETE FROM \"ArEventTasks\"
      WHERE note = '${BASELINE_NOTE}' OR event_uuid IN (${FIXTURES});
    DELETE FROM \"EventLineItems\" WHERE event_uuid IN (${FIXTURES});
    DELETE FROM \"Events\" WHERE id IN (${FIXTURES});
  " >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "--- setting up fixture: 3 booked events starting today, 1000 owed on each, no tasks ---"
cleanup
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  INSERT INTO \"Events\" (id, event_name, event_start, event_end, lenient, must_be_clean, event_status)
  SELECT id, 'concurrency probe', d, d + 1, false, false, 'booked'
  FROM unnest(ARRAY['${EVENT_A}', '${EVENT_B}', '${EVENT_C}']::uuid[]) AS id,
       (SELECT (now() AT TIME ZONE 'America/Toronto')::date AS d) AS t;

  INSERT INTO \"EventLineItems\" (header, currency, value_cents, quantity, event_uuid)
  SELECT 'line', 'USD', 1000, 1, id
  FROM unnest(ARRAY['${EVENT_A}', '${EVENT_B}', '${EVENT_C}']::uuid[]) AS id;

  -- Every booked event that is not a fixture already has an open task, so the job skips it.
  INSERT INTO \"ArEventTasks\" (due_date, note, event_uuid)
  SELECT current_date, '${BASELINE_NOTE}', e.id
  FROM \"Events\" e
  WHERE e.event_status = 'booked' AND NOT e.deleted
    AND e.id NOT IN (${FIXTURES})
    AND NOT EXISTS (SELECT 1 FROM \"ArEventTasks\" t WHERE t.event_uuid = e.id AND t.completed = false);
"

echo "--- session 1: running the job, sleeping 2s before commit ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 -tA <<SQL > "${TMPDIR:-/tmp}/ar_cron_s1.$$" &
BEGIN;
SELECT public.create_ar_collection_tasks();
SELECT pg_sleep(2);
COMMIT;
SQL
SESSION1_PID=$!

sleep 1

echo "--- session 2: running the job while session 1 is mid-sleep ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 -tA <<SQL > "${TMPDIR:-/tmp}/ar_cron_s2.$$" &
BEGIN;
SELECT public.create_ar_collection_tasks();
COMMIT;
SQL
SESSION2_PID=$!

S1_STATUS=0
S2_STATUS=0
wait "$SESSION1_PID" || S1_STATUS=$?
wait "$SESSION2_PID" || S2_STATUS=$?

S1_MADE="$(grep -E '^[0-9]+$' "${TMPDIR:-/tmp}/ar_cron_s1.$$" | head -n 1 || true)"
S2_MADE="$(grep -E '^[0-9]+$' "${TMPDIR:-/tmp}/ar_cron_s2.$$" | head -n 1 || true)"
rm -f "${TMPDIR:-/tmp}/ar_cron_s1.$$" "${TMPDIR:-/tmp}/ar_cron_s2.$$"

if [ "$S1_STATUS" -ne 0 ] || [ "$S2_STATUS" -ne 0 ]; then
  echo "FAIL: a session errored (session 1 exit ${S1_STATUS}, session 2 exit ${S2_STATUS}); the job is not safe to overlap"
  exit 1
fi

echo "--- session 3: asserting final state (session 1 made ${S1_MADE:-?}, session 2 made ${S2_MADE:-?}) ---"
OPEN_PER_EVENT="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tA -c "
  SELECT string_agg(n::text, ',' ORDER BY id)
  FROM (SELECT e.id, count(t.id) FILTER (WHERE t.completed = false) AS n
        FROM \"Events\" e LEFT JOIN \"ArEventTasks\" t ON t.event_uuid = e.id
        WHERE e.id IN (${FIXTURES}) GROUP BY e.id) x;
")"
SYSTEM_TASKS="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tA -c "
  SELECT count(*) FROM \"ArEventTasks\" WHERE event_uuid IN (${FIXTURES}) AND note = '${SYSTEM_NOTE}';
")"
OPEN_PER_EVENT="$(echo "$OPEN_PER_EVENT" | xargs)"
SYSTEM_TASKS="$(echo "$SYSTEM_TASKS" | xargs)"

if [ "$OPEN_PER_EVENT" = "1,1,1" ] && [ "$SYSTEM_TASKS" = "3" ]; then
  echo "PASS: both sessions finished without an error and every fixture event has exactly one open task"
  exit 0
else
  echo "FAIL: expected one open task on each of 3 events (1,1,1) and 3 system tasks, got '${OPEN_PER_EVENT}' and '${SYSTEM_TASKS}'"
  exit 1
fi
