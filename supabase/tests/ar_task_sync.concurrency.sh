#!/usr/bin/env bash
# ============================================================================
# Concurrency check for ar_sync_all_event_tasks() and the deferred triggers
# (docs/specs/accountant-collections-11-task-sync.md §4)
#
# Two sessions run the nightly function at the same moment while a third writes payments. The
# nightly sessions read "no open task" for the same events before either commits, so both try to
# insert; the payment writes fire the deferred triggers at their own commit, in the middle of it.
# Without the conflict clause on the partial unique index (one open task per event), the second
# session fails with a unique violation (23505) once the first commits. With it, the second waits for
# the first, does nothing, and neither errors.
#
# Session 1: BEGIN; SELECT ar_sync_all_event_tasks(); pg_sleep(2); COMMIT;
# Session 2 (~1s in, mid-sleep): BEGIN; SELECT ar_sync_all_event_tasks(); COMMIT;
# Session 3 (~1.5s in): pays event A in full and event B in part, each its own commit (so each runs
#   the trigger at commit and has to wait for session 1)
# Session 4 (after all finish): no session errored, no fixture event has more than one open task, and
#   the event nobody paid (C) has exactly one.
# What it does NOT assert: whether A and B end with a task. A payment that commits while session 1
# still holds its task for the same event can leave that task open although the event is paid; the
# next nightly run closes it (spec 11 §1, reading 7 is the same family of races).
#
# The nightly function looks at EVERY booked event in the database and completes as well as creates,
# so this script snapshots ArEventTasks first and puts the snapshot back in its cleanup, with the
# fixtures removed. Do not point it at a database that matters, and do not run it while someone is
# working in the app.
#
# Usage:
#   ./ar_task_sync.concurrency.sh
#
# Requires `psql` on PATH and a local Supabase Postgres on the usual local port (override with
# DB_URL). Requires 20261028130000_ar_amount_due.sql and 20261031120000_ar_task_sync.sql to be
# applied (committed), because the sessions are separate connections.
# ============================================================================

set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"

# Fixed, namespaced UUIDs so repeat runs are trivially idempotent.
EVENT_A="c0ffee11-0000-4000-8000-0000000000a1"
EVENT_B="c0ffee11-0000-4000-8000-0000000000b2"
EVENT_C="c0ffee11-0000-4000-8000-0000000000c3"
FIXTURES="'${EVENT_A}', '${EVENT_B}', '${EVENT_C}'"
SNAPSHOT="ar_task_sync_conc_snapshot"
TMP="${TMPDIR:-/tmp}"

cleanup() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
    DELETE FROM \"PaymentHistory\" WHERE event_uuid IN (${FIXTURES});
    DELETE FROM \"EventLineItems\" WHERE event_uuid IN (${FIXTURES});
    DELETE FROM \"Events\" WHERE id IN (${FIXTURES});
    DO \$\$
    BEGIN
      IF to_regclass('public.${SNAPSHOT}') IS NOT NULL THEN
        DELETE FROM \"ArEventTasks\";
        INSERT INTO \"ArEventTasks\" SELECT * FROM public.${SNAPSHOT};
        DROP TABLE public.${SNAPSHOT};
      END IF;
    END
    \$\$;
  " >/dev/null 2>&1 || echo "WARNING: cleanup failed; check ArEventTasks and the ${SNAPSHOT} table by hand"
}
trap cleanup EXIT

echo "--- setting up fixture: 3 booked events starting today, 1000 owed on each, no tasks ---"
cleanup
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  CREATE UNLOGGED TABLE public.${SNAPSHOT} AS TABLE \"ArEventTasks\";

  INSERT INTO \"Events\" (id, event_name, event_start, event_end, lenient, must_be_clean, event_status)
  SELECT id, 'concurrency probe', d, d + 1, false, false, 'booked'
  FROM unnest(ARRAY['${EVENT_A}', '${EVENT_B}', '${EVENT_C}']::uuid[]) AS id,
       (SELECT (now() AT TIME ZONE 'America/Toronto')::date AS d) AS t;

  INSERT INTO \"EventLineItems\" (header, currency, value_cents, quantity, event_uuid)
  SELECT 'line', 'USD', 1000, 1, id
  FROM unnest(ARRAY['${EVENT_A}', '${EVENT_B}', '${EVENT_C}']::uuid[]) AS id;
"

# The fixtures' own inserts fired the deferred triggers at commit; start from "no tasks".
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
  DELETE FROM \"ArEventTasks\" WHERE event_uuid IN (${FIXTURES});
"

echo "--- session 1: running the nightly function, sleeping 2s before commit ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 -tA <<SQL > "${TMP}/ar_sync_s1.$$" 2>&1 &
BEGIN;
SELECT created || ',' || completed FROM public.ar_sync_all_event_tasks();
SELECT pg_sleep(2);
COMMIT;
SQL
SESSION1_PID=$!

sleep 1

echo "--- session 2: running the nightly function while session 1 is mid-sleep ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 -tA <<SQL > "${TMP}/ar_sync_s2.$$" 2>&1 &
BEGIN;
SELECT created || ',' || completed FROM public.ar_sync_all_event_tasks();
COMMIT;
SQL
SESSION2_PID=$!

sleep 0.5

echo "--- session 3: paying A in full and B in part while session 1 still holds its tasks ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 -tA <<SQL > "${TMP}/ar_sync_s3.$$" 2>&1 &
INSERT INTO "PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name)
VALUES ('${EVENT_A}', 1000, 'USD', 'succeeded', 'Concurrency');
INSERT INTO "PaymentHistory" (event_uuid, amount_cents, currency, status, payer_name)
VALUES ('${EVENT_B}', 400, 'USD', 'succeeded', 'Concurrency');
SQL
SESSION3_PID=$!

S1_STATUS=0
S2_STATUS=0
S3_STATUS=0
wait "$SESSION1_PID" || S1_STATUS=$?
wait "$SESSION2_PID" || S2_STATUS=$?
wait "$SESSION3_PID" || S3_STATUS=$?

S1_OUT="$(grep -E '^[0-9]+,[0-9]+$' "${TMP}/ar_sync_s1.$$" | head -n 1 || true)"
S2_OUT="$(grep -E '^[0-9]+,[0-9]+$' "${TMP}/ar_sync_s2.$$" | head -n 1 || true)"
if [ "$S1_STATUS" -ne 0 ] || [ "$S2_STATUS" -ne 0 ] || [ "$S3_STATUS" -ne 0 ]; then
  echo "FAIL: a session errored (session 1 exit ${S1_STATUS}, session 2 exit ${S2_STATUS}, session 3 exit ${S3_STATUS})"
  cat "${TMP}/ar_sync_s1.$$" "${TMP}/ar_sync_s2.$$" "${TMP}/ar_sync_s3.$$" | grep -i "error" || true
  rm -f "${TMP}/ar_sync_s1.$$" "${TMP}/ar_sync_s2.$$" "${TMP}/ar_sync_s3.$$"
  exit 1
fi
rm -f "${TMP}/ar_sync_s1.$$" "${TMP}/ar_sync_s2.$$" "${TMP}/ar_sync_s3.$$"

echo "--- session 4: asserting the final state (created,completed: session 1 ${S1_OUT:-?}, session 2 ${S2_OUT:-?}) ---"
OPEN_PER_EVENT="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -tA -c "
  SELECT string_agg(n::text, ',' ORDER BY id)
  FROM (SELECT e.id, count(t.id) FILTER (WHERE t.completed = false) AS n
        FROM \"Events\" e LEFT JOIN \"ArEventTasks\" t ON t.event_uuid = e.id
        WHERE e.id IN (${FIXTURES}) GROUP BY e.id) x;
")"
OPEN_PER_EVENT="$(echo "$OPEN_PER_EVENT" | xargs)"

# Order is A, B, C. C was never paid, so it must have exactly one; A and B at most one.
IFS=',' read -r OPEN_A OPEN_B OPEN_C <<< "$OPEN_PER_EVENT"
if [ "${OPEN_A:-9}" -le 1 ] && [ "${OPEN_B:-9}" -le 1 ] && [ "${OPEN_C:-9}" = "1" ]; then
  echo "PASS: no session errored and no event has more than one open task (A=${OPEN_A}, B=${OPEN_B}, C=${OPEN_C})"
  exit 0
else
  echo "FAIL: expected at most one open task on A and B and exactly one on C, got '${OPEN_PER_EVENT}'"
  exit 1
fi
