-- ============================================================================
-- Tests for the Collections table ArEventTasks: shape, constraints and access
-- Migration: 20261028120000_ar_event_tasks.sql
-- Spec:      docs/specs/accountant-collections-01-backend.md (§3, §6)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ar_event_tasks.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the shape: exactly six columns, their types, NOT NULLs and defaults;
--   * the constraints: a blank note is refused (23514), a second OPEN task for one event is
--     refused (23505) while completed ones pile up, a task for a missing event is refused (23503)
--     and deleting an event takes its tasks with it;
--   * the access, one named assertion per role: an active accountant and an admin select, insert
--     and update; an account manager, developer, viewer, maintainer, driver, an inactive
--     accountant and a user with no role read nothing and are refused on insert (42501). An UPDATE
--     or DELETE that RLS filters out does not raise, so every refusal is also checked by reading
--     the row afterwards as the table owner (a refused role cannot read it back itself);
--   * nobody can DELETE: not even the roles that can write.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(91);

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

-- A fresh Event; every scenario below gets its own so the one-open-task rule never crosses over.
CREATE FUNCTION public.test_new_event(label text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean)
  VALUES ('ArEventTasks probe ' || label, '2026-07-01', '2026-07-02', false, false)
  RETURNING id;
$$;

-- What the table really holds, read with the owner's rights (SECURITY DEFINER bypasses RLS), so a
-- role that is refused the SELECT can still have its refused UPDATE / DELETE checked.
CREATE FUNCTION public.test_task_note(task uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT note FROM public."ArEventTasks" WHERE id = task;
$$;
CREATE FUNCTION public.test_task_exists(task uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public."ArEventTasks" WHERE id = task);
$$;

-- ── Fixtures: one user per role ─────────────────────────────────────────────

INSERT INTO public."UserStatuses" (id, status)
VALUES ('7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5', 'Inactive')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'acct', 'aet_acct@test.com', 'clerk_aet_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'acct_off', 'aet_acct_off@test.com', 'clerk_aet_acct_off', false, false)
RETURNING id AS user_acct_off \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct_off', false);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'admin', 'aet_admin@test.com', 'clerk_aet_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'am', 'aet_am@test.com', 'clerk_aet_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'dev', 'aet_dev@test.com', 'clerk_aet_dev', false, false)
RETURNING id AS user_dev \gset
INSERT INTO public."Developers" (user_uuid, is_active) VALUES (:'user_dev', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'viewer', 'aet_viewer@test.com', 'clerk_aet_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'maint', 'aet_maint@test.com', 'clerk_aet_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'driver', 'aet_driver@test.com', 'clerk_aet_driver', false, false)
RETURNING id AS user_driver \gset
INSERT INTO public."Drivers" (user_uuid, is_active) VALUES (:'user_driver', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('T', 'norole', 'aet_norole@test.com', 'clerk_aet_norole', false, false)
RETURNING id AS user_norole \gset

-- ═══ SHAPE (spec §3) ════════════════════════════════════════════════════════

SELECT has_table('public', 'ArEventTasks', 'the table ArEventTasks exists');
SELECT columns_are('public', 'ArEventTasks', ARRAY['id','created_at','due_date','completed','note','event_uuid'],
  'ArEventTasks has exactly the six columns of the spec');
SELECT col_type_is('public', 'ArEventTasks', 'id', 'uuid', 'id is uuid');
SELECT col_type_is('public', 'ArEventTasks', 'created_at', 'timestamp with time zone', 'created_at is timestamp with time zone');
SELECT col_type_is('public', 'ArEventTasks', 'due_date', 'date', 'due_date is date');
SELECT col_type_is('public', 'ArEventTasks', 'completed', 'boolean', 'completed is boolean');
SELECT col_type_is('public', 'ArEventTasks', 'note', 'text', 'note is text');
SELECT col_type_is('public', 'ArEventTasks', 'event_uuid', 'uuid', 'event_uuid is uuid');
SELECT col_not_null('public', 'ArEventTasks', 'id', 'id is NOT NULL');
SELECT col_not_null('public', 'ArEventTasks', 'created_at', 'created_at is NOT NULL');
SELECT col_not_null('public', 'ArEventTasks', 'due_date', 'due_date is NOT NULL');
SELECT col_not_null('public', 'ArEventTasks', 'completed', 'completed is NOT NULL');
SELECT col_not_null('public', 'ArEventTasks', 'note', 'note is NOT NULL');
SELECT col_not_null('public', 'ArEventTasks', 'event_uuid', 'event_uuid is NOT NULL');
SELECT col_default_is('public', 'ArEventTasks', 'completed', 'false', 'completed defaults to false');
SELECT col_default_is('public', 'ArEventTasks', 'created_at', 'now()', 'created_at defaults to now()');
SELECT col_default_is('public', 'ArEventTasks', 'id', 'gen_random_uuid()', 'id is generated');

SELECT public.test_new_event('shape') AS ev_shape \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'shape probe', :'ev_shape')
RETURNING id AS task_shape \gset

SELECT is((SELECT completed FROM public."ArEventTasks" WHERE id = :'task_shape'), false,
  'a task inserted without completed is open');
SELECT is((SELECT created_at FROM public."ArEventTasks" WHERE id = :'task_shape'), now(),
  'a task inserted without created_at is stamped now()');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ArEventTasks'
  AND indexname = 'ar_event_tasks_one_open_per_event'
  AND indexdef LIKE 'CREATE UNIQUE INDEX%(event_uuid)%WHERE (completed = false)'),
  'the partial unique index allows one open task per event');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'ArEventTasks'
  AND indexname = 'ar_event_tasks_event_idx' AND indexdef NOT LIKE '%WHERE%' AND indexdef LIKE '%(event_uuid)'),
  'a plain index on event_uuid serves the cascade and the all-tasks-of-an-event read');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public."ArEventTasks"'::regclass),
  'row level security is on');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'ArEventTasks' AND cmd IN ('DELETE', 'ALL')), 0,
  'there is no DELETE policy for anyone');

-- ═══ THE NOTE ═══════════════════════════════════════════════════════════════

SELECT public.test_new_event('note') AS ev_note \gset
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', '''', %L)', :'ev_note'),
  '23514', NULL, 'an empty note is refused');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''   '', %L)', :'ev_note'),
  '23514', NULL, 'a note of only spaces is refused');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''x'', %L)', :'ev_note'),
  'a one-character note is accepted');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed) VALUES (''1999-01-01'', ''past date'', %L, true)', :'ev_note'),
  'the database accepts any date: the rule "today or later" lives in the interface only');

-- ═══ ONE OPEN TASK PER EVENT ════════════════════════════════════════════════

SELECT public.test_new_event('one-open-a') AS ev_one_a \gset
SELECT public.test_new_event('one-open-b') AS ev_one_b \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'first open', :'ev_one_a')
RETURNING id AS task_one_a \gset

SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-02'', ''second open'', %L)', :'ev_one_a'),
  '23505', NULL, 'a second open task for the same event is refused');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed) VALUES (''2026-10-01'', ''done once'', %L, true)', :'ev_one_a'),
  'a completed task next to the open one is accepted');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed) VALUES (''2026-10-02'', ''done twice'', %L, true)', :'ev_one_a'),
  'a second completed task for the same event is accepted');
SELECT lives_ok(
  format('UPDATE public."ArEventTasks" SET completed = true WHERE id = %L', :'task_one_a'),
  'the open task can be completed');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-03'', ''next open'', %L)', :'ev_one_a'),
  'after completing the open task a new open task can be inserted');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''other event open'', %L)', :'ev_one_b'),
  'an open task on a different event is accepted');

-- ═══ THE FOREIGN KEY ════════════════════════════════════════════════════════

SELECT throws_ok(
  $$INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES ('2026-11-01', 'orphan', gen_random_uuid())$$,
  '23503', NULL, 'a task for an event that does not exist is refused');
SELECT public.test_new_event('cascade') AS ev_cascade \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid, completed) VALUES
  ('2026-10-01', 'cascade done', :'ev_cascade', true),
  ('2026-11-01', 'cascade open', :'ev_cascade', false);
DELETE FROM public."Events" WHERE id = :'ev_cascade';
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE event_uuid = :'ev_cascade'), 0,
  'deleting an event deletes its tasks, open and completed');

-- ═══ ACCESS: one fixture task, then one block per role ═══════════════════════

SELECT public.test_new_event('access') AS ev_access \gset
INSERT INTO public."ArEventTasks" (due_date, note, event_uuid)
VALUES ('2026-11-01', 'access original', :'ev_access')
RETURNING id AS task_access \gset
-- A third event with no task: the target of every INSERT the roles try.
SELECT public.test_new_event('access-insert') AS ev_access_ins \gset

SELECT public.test_new_event('acct-writes') AS ev_acct_w \gset
SELECT public.test_new_event('admin-writes') AS ev_admin_w \gset

SET LOCAL ROLE authenticated;

-- ═══ THE ROLES THAT USE THE TABLE ═══════════════════════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_acct')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 1,
  'an active accountant can read a task');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''acct wrote'', %L)', :'ev_acct_w'),
  'an active accountant can create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''acct edited'' WHERE event_uuid = %L', :'ev_acct_w')),
  1, 'an active accountant can update a task');
SELECT is((SELECT note FROM public."ArEventTasks" WHERE event_uuid = :'ev_acct_w'), 'acct edited',
  '...and the task is changed');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'an active accountant cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (an active accountant)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_admin')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 1,
  'an admin can read a task');
SELECT lives_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''admin wrote'', %L)', :'ev_admin_w'),
  'an admin can create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''admin edited'' WHERE event_uuid = %L', :'ev_admin_w')),
  1, 'an admin can update a task');
SELECT is((SELECT note FROM public."ArEventTasks" WHERE event_uuid = :'ev_admin_w'), 'admin edited',
  '...and the task is changed');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'an admin cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (an admin)');

-- ═══ EVERYONE ELSE reads nothing and writes nothing ═══════════════════════════

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_am')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 0,
  'an account manager reads no task');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''am intruder'', %L)', :'ev_access_ins'),
  '42501', NULL, 'an account manager cannot create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''am edited'' WHERE id = %L', :'task_access')),
  0, 'an account manager cannot update a task');
SELECT is(public.test_task_note(:'task_access'), 'access original',
  '...and the task is unchanged (an account manager)');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'an account manager cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (an account manager)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_dev')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 0,
  'a developer reads no task');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''dev intruder'', %L)', :'ev_access_ins'),
  '42501', NULL, 'a developer cannot create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''dev edited'' WHERE id = %L', :'task_access')),
  0, 'a developer cannot update a task');
SELECT is(public.test_task_note(:'task_access'), 'access original',
  '...and the task is unchanged (a developer)');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'a developer cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (a developer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_viewer')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 0,
  'a viewer reads no task');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''viewer intruder'', %L)', :'ev_access_ins'),
  '42501', NULL, 'a viewer cannot create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''viewer edited'' WHERE id = %L', :'task_access')),
  0, 'a viewer cannot update a task');
SELECT is(public.test_task_note(:'task_access'), 'access original',
  '...and the task is unchanged (a viewer)');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'a viewer cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (a viewer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_maint')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 0,
  'a maintainer reads no task');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''maint intruder'', %L)', :'ev_access_ins'),
  '42501', NULL, 'a maintainer cannot create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''maint edited'' WHERE id = %L', :'task_access')),
  0, 'a maintainer cannot update a task');
SELECT is(public.test_task_note(:'task_access'), 'access original',
  '...and the task is unchanged (a maintainer)');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'a maintainer cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (a maintainer)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_driver')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 0,
  'a driver reads no task');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''driver intruder'', %L)', :'ev_access_ins'),
  '42501', NULL, 'a driver cannot create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''driver edited'' WHERE id = %L', :'task_access')),
  0, 'a driver cannot update a task');
SELECT is(public.test_task_note(:'task_access'), 'access original',
  '...and the task is unchanged (a driver)');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'a driver cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (a driver)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_acct_off')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 0,
  'an inactive accountant reads no task');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''acct_off intruder'', %L)', :'ev_access_ins'),
  '42501', NULL, 'an inactive accountant cannot create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''acct_off edited'' WHERE id = %L', :'task_access')),
  0, 'an inactive accountant cannot update a task');
SELECT is(public.test_task_note(:'task_access'), 'access original',
  '...and the task is unchanged (an inactive accountant)');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'an inactive accountant cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (an inactive accountant)');

SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_aet_norole')::text, true);
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE id = :'task_access'), 0,
  'a user with no role reads no task');
SELECT throws_ok(
  format('INSERT INTO public."ArEventTasks" (due_date, note, event_uuid) VALUES (''2026-11-01'', ''norole intruder'', %L)', :'ev_access_ins'),
  '42501', NULL, 'a user with no role cannot create a task');
SELECT is(
  public.test_rows_affected(format('UPDATE public."ArEventTasks" SET note = ''norole edited'' WHERE id = %L', :'task_access')),
  0, 'a user with no role cannot update a task');
SELECT is(public.test_task_note(:'task_access'), 'access original',
  '...and the task is unchanged (a user with no role)');
SELECT is(
  public.test_rows_affected(format('DELETE FROM public."ArEventTasks" WHERE id = %L', :'task_access')),
  0, 'a user with no role cannot delete a task');
SELECT ok(public.test_task_exists(:'task_access'),
  '...and the task is still there (a user with no role)');

RESET ROLE;

SELECT is((SELECT note FROM public."ArEventTasks" WHERE id = :'task_access'), 'access original',
  'after every role has tried, the fixture task is exactly as it was');
SELECT is((SELECT count(*)::int FROM public."ArEventTasks" WHERE event_uuid = :'ev_access_ins'), 0,
  'no refused INSERT left a row behind');

SELECT * FROM finish();
ROLLBACK;
