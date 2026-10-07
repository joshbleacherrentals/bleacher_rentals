-- ============================================================================
-- Tests for WorkTrackerGroups.is_paid
-- Migration: 20261003120000_work_tracker_group_is_paid.sql
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/work_tracker_group_is_paid.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the column is a NOT NULL boolean that defaults to false, so every existing group is unpaid;
--   * an admin and an accountant can mark a group paid and unpaid, on update and on insert;
--   * nobody else can — an account manager, who CAN still update the rest of the group, is
--     refused with 42501 (what the PowerSync connector treats as unrecoverable), on update, on
--     insert and through an upsert that would flip the flag. A viewer / maintainer never reach
--     the row at all;
--   * the refusal is about the flag only: an account manager still moves a week between payment
--     statuses and still creates the group of a week that has none;
--   * a session that is not an app user (service role, migrations, backfills) is not blocked.
-- An UPDATE that RLS filters out does not raise, so those refusals are also checked by reading
-- the row afterwards.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(26);

-- Rows affected by a statement, run as the current (RLS-bound) role.
CREATE FUNCTION public.test_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Paid', 'Admin', 'paid_admin@test.com', 'clerk_paid_admin', true, false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Paid', 'Accountant', 'paid_acct@test.com', 'clerk_paid_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Paid', 'AcctOff', 'paid_acct_off@test.com', 'clerk_paid_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Paid', 'AM', 'paid_am@test.com', 'clerk_paid_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

-- Holds both roles: an account manager is refused, an accountant is not, so the union is let in.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Paid', 'AMAcct', 'paid_am_acct@test.com', 'clerk_paid_am_acct', false, false)
RETURNING id AS user_am_acct \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am_acct', true);
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_am_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Paid', 'Viewer', 'paid_viewer@test.com', 'clerk_paid_viewer', false, true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Paid', 'Maint', 'paid_maint@test.com', 'clerk_paid_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Drew', 'Driver', 'paid_driver@test.com', 'clerk_paid_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_driver', false)
RETURNING id AS driver \gset

-- Two groups made the way the app makes them: the column is not named, so it takes its default.
INSERT INTO public."WorkTrackerGroups" (driver_uuid, week_start, week_end)
VALUES (:'driver', '2026-09-21', '2026-09-27')
RETURNING id AS grp \gset

INSERT INTO public."WorkTrackerGroups" (driver_uuid, week_start, week_end)
VALUES (:'driver', '2026-09-14', '2026-09-20')
RETURNING id AS grp_old \gset

-- ═══ The column ══════════════════════════════════════════════════════════════

SELECT is(
  (SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkTrackerGroups' AND column_name = 'is_paid'),
  'boolean',
  'is_paid is a boolean'
);
SELECT is(
  (SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'WorkTrackerGroups' AND column_name = 'is_paid'),
  'NO',
  'is_paid is NOT NULL'
);
SELECT is((SELECT is_paid FROM public."WorkTrackerGroups" WHERE id = :'grp'), false,
  'a group made without naming the column is unpaid');
SELECT throws_ok(
  format('UPDATE public."WorkTrackerGroups" SET is_paid = NULL WHERE id = %L', :'grp'),
  '23502',
  NULL,
  'is_paid cannot be set to NULL'
);

-- ═══ An admin ════════════════════════════════════════════════════════════════

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_paid_admin')::text, true);

SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = true WHERE id = %L', :'grp')),
  1,
  'an admin can mark a group paid'
);
SELECT is((SELECT is_paid FROM public."WorkTrackerGroups" WHERE id = :'grp'), true,
  '...and it is paid');
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = false WHERE id = %L', :'grp')),
  1,
  'an admin can mark it unpaid again'
);
SELECT lives_ok(
  format(
    'INSERT INTO public."WorkTrackerGroups" (driver_uuid, week_start, week_end, is_paid) VALUES (%L, ''2026-09-07'', ''2026-09-13'', true)',
    :'driver'),
  'an admin can create a group that is already paid'
);

-- ═══ An accountant ═══════════════════════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_paid_acct')::text, true);

SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = true WHERE id = %L', :'grp')),
  1,
  'an accountant can mark a group paid'
);
SELECT is((SELECT is_paid FROM public."WorkTrackerGroups" WHERE id = :'grp'), true,
  '...and it is paid');
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = false WHERE id = %L', :'grp')),
  1,
  'an accountant can mark it unpaid again'
);
SELECT lives_ok(
  format(
    'INSERT INTO public."WorkTrackerGroups" (driver_uuid, week_start, week_end, is_paid) VALUES (%L, ''2026-08-31'', ''2026-09-06'', true)',
    :'driver'),
  'an accountant can create a group that is already paid'
);

-- Both roles: the accountant half is enough.
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_paid_am_acct')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = true WHERE id = %L', :'grp_old')),
  1,
  'someone who is both an account manager and an accountant can mark a group paid'
);

-- ═══ An account manager: every other column, but not this one ════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_paid_am')::text, true);

-- grp_old is paid (just above), grp is unpaid.
SELECT throws_ok(
  format('UPDATE public."WorkTrackerGroups" SET is_paid = true WHERE id = %L', :'grp'),
  '42501',
  'Only an admin or an accountant can mark a work tracker group paid or unpaid',
  'an account manager cannot mark a group paid'
);
SELECT throws_ok(
  format('UPDATE public."WorkTrackerGroups" SET is_paid = false WHERE id = %L', :'grp_old'),
  '42501',
  'Only an admin or an accountant can mark a work tracker group paid or unpaid',
  'an account manager cannot mark a paid group unpaid'
);
SELECT throws_ok(
  format(
    'INSERT INTO public."WorkTrackerGroups" (driver_uuid, week_start, week_end, is_paid) VALUES (%L, ''2026-08-24'', ''2026-08-30'', true)',
    :'driver'),
  '42501',
  'Only an admin or an accountant can mark a work tracker group paid or unpaid',
  'an account manager cannot create a group that is already paid'
);
-- The PowerSync upload connector writes a new row as an upsert; the flag cannot be flipped that way.
SELECT throws_ok(
  format(
    'INSERT INTO public."WorkTrackerGroups" (id, driver_uuid, week_start, week_end, is_paid) VALUES (%L, %L, ''2026-09-14'', ''2026-09-20'', false) ON CONFLICT (id) DO UPDATE SET is_paid = EXCLUDED.is_paid',
    :'grp_old', :'driver'),
  '42501',
  NULL,
  'an account manager cannot flip the flag through an upsert either'
);

-- The refusal is about the flag alone.
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET status = ''no_bill_ready_for_payment'' WHERE id = %L', :'grp')),
  1,
  'an account manager can still mark a week Ready for Payment'
);
SELECT lives_ok(
  format(
    'INSERT INTO public."WorkTrackerGroups" (driver_uuid, week_start, week_end, status) VALUES (%L, ''2026-08-17'', ''2026-08-23'', ''draft'')',
    :'driver'),
  'an account manager can still create the group of a week that has none'
);
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = is_paid WHERE id = %L', :'grp')),
  1,
  'a write that leaves the flag as it is passes'
);

-- ═══ Viewer, maintainer, deactivated accountant: not the flag, not even the row ═

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_paid_viewer')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = true WHERE id = %L', :'grp')),
  0,
  'a viewer cannot mark a group paid'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_paid_maint')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = true WHERE id = %L', :'grp')),
  0,
  'a maintainer cannot mark a group paid'
);

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_paid_acct_off')::text, true);
SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = true WHERE id = %L', :'grp')),
  0,
  'an accountant whose role is switched off cannot mark a group paid'
);

-- ═══ Afterwards ═══════════════════════════════════════════════════════════════

RESET ROLE;

SELECT is((SELECT is_paid FROM public."WorkTrackerGroups" WHERE id = :'grp'), false,
  'after every refused write the unpaid group is still unpaid');
SELECT is((SELECT is_paid FROM public."WorkTrackerGroups" WHERE id = :'grp_old'), true,
  '...and the paid group is still paid');

-- ═══ A session that is not an app user ═══════════════════════════════════════
-- Migrations, backfills and the service role run as another database role and have no
-- row in the permission matrix; they must not be locked out of the column.

SELECT is(
  public.test_rows_affected(format('UPDATE public."WorkTrackerGroups" SET is_paid = false WHERE id = %L', :'grp_old')),
  1,
  'a database session that is not an app user can still change the flag'
);

SELECT * FROM finish();
ROLLBACK;
