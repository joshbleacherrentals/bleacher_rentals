-- ============================================================================
-- Tests for the analytics_ro role and the McpQueryLog table
-- Migration: 20261117120000_analytics_mcp.sql
-- Spec:      docs/specs/analytics-mcp.md (§1 D1, D4, D5, §2, §3 layer 1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/analytics_ro.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the role: not a superuser, cannot create roles or databases, bypasses RLS, and has the read-only
--     and timeout defaults;
--   * what it may do: SELECT on the tables of public, including one created after the migration
--     (D1), and nothing else: no INSERT, UPDATE, DELETE, TRUNCATE, no CREATE in the schema;
--   * what it may not read: QboConnections (D4) and McpQueryLog (D5);
--   * RLS: it sees every row of an RLS-protected table, the same count as the owner;
--   * McpQueryLog: RLS on, no policy, so a signed-in app user can neither write nor read it.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(25);

-- postgres created the role, so it only holds ADMIN on it. Let it SET ROLE for this test.
GRANT analytics_ro TO postgres WITH SET TRUE;

-- The SQLSTATE of a statement run as another role ('ok' when it ran), or its row count.
CREATE FUNCTION public.ro_run(role_name text, q text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role_name);
  BEGIN
    EXECUTE q;
    r := 'ok';
  EXCEPTION WHEN OTHERS THEN
    r := SQLSTATE;
  END;
  RESET ROLE;
  RETURN r;
END;
$$;

CREATE FUNCTION public.ro_count(role_name text, q text) RETURNS bigint
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE format('SET LOCAL ROLE %I', role_name);
  EXECUTE q INTO n;
  RESET ROLE;
  RETURN n;
END;
$$;

-- ---------------------------------------------------------------------------
-- The role
-- ---------------------------------------------------------------------------
SELECT ok(EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_ro'), 'the role analytics_ro exists');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'analytics_ro' AND (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication)
  ),
  'it is not a superuser and cannot create roles, databases or replicate');
SELECT ok(
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'analytics_ro'),
  'it bypasses RLS (the app policies are written for the authenticated role)');
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
    WHERE r.rolname = 'analytics_ro' AND 'default_transaction_read_only=on' = ANY (s.setconfig)),
  'its transactions are read-only by default');
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole
    WHERE r.rolname = 'analytics_ro' AND 'statement_timeout=15s' = ANY (s.setconfig)),
  'its statements stop after 15 seconds');

-- ---------------------------------------------------------------------------
-- What it may and may not touch (the privileges)
-- ---------------------------------------------------------------------------
SELECT ok(NOT has_table_privilege('analytics_ro', 'public."QboConnections"', 'SELECT'),
  'D4: it cannot read QboConnections (an encrypted QuickBooks token)');
SELECT ok(NOT has_table_privilege('analytics_ro', 'public."McpQueryLog"', 'SELECT'),
  'D5: it cannot read McpQueryLog (what colleagues asked)');
SELECT ok(has_table_privilege('analytics_ro', 'public."Users"', 'SELECT'),
  'D1: it can read the other tables, with no list to maintain');
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'analytics_ro' AND table_schema = 'public' AND privilege_type <> 'SELECT'),
  'it holds no privilege but SELECT on any table');
SELECT ok(NOT has_schema_privilege('analytics_ro', 'public', 'CREATE'),
  'it cannot create anything in the public schema');

-- ---------------------------------------------------------------------------
-- What it does (run as the role)
-- ---------------------------------------------------------------------------
-- CI resets the database with --no-seed, so Users is empty there. Bring one row of our own: with
-- none, "the same count as the owner" below would be 0 = 0 and prove nothing.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id)
VALUES ('Analytics', 'Probe', 'analytics-ro-probe@example.com', 'clerk_analytics_ro_probe');

SELECT count(*) AS owner_users FROM public."Users" \gset

SELECT is(public.ro_run('analytics_ro', 'SELECT count(*) FROM public."Events"'), 'ok',
  'as analytics_ro: a SELECT works');
SELECT ok(:owner_users > 0, 'Users has a row to compare (this test inserts one, so it needs no seed data)');
SELECT is(public.ro_count('analytics_ro', 'SELECT count(*) FROM public."Users"'), :owner_users::bigint,
  'as analytics_ro: an RLS-protected table shows every row, the same count as the owner');

SELECT is(public.ro_run('analytics_ro', $q$INSERT INTO public."Users" (email) VALUES ('x@example.com')$q$), '42501',
  'as analytics_ro: INSERT is refused (permission denied)');
SELECT is(public.ro_run('analytics_ro', 'UPDATE public."Users" SET email = email'), '42501',
  'as analytics_ro: UPDATE is refused');
SELECT is(public.ro_run('analytics_ro', 'DELETE FROM public."Users"'), '42501',
  'as analytics_ro: DELETE is refused');
SELECT is(public.ro_run('analytics_ro', 'TRUNCATE public."Users"'), '42501',
  'as analytics_ro: TRUNCATE is refused');
SELECT is(public.ro_run('analytics_ro', 'CREATE TABLE public.analytics_ro_nope (a int)'), '42501',
  'as analytics_ro: CREATE TABLE is refused');
SELECT is(public.ro_run('analytics_ro', 'SELECT * FROM public."QboConnections"'), '42501',
  'as analytics_ro: QboConnections is refused');
SELECT is(public.ro_run('analytics_ro', 'SELECT * FROM public."McpQueryLog"'), '42501',
  'as analytics_ro: McpQueryLog is refused');

-- A table created after the migration, by the role that runs migrations (postgres): the default
-- privileges make it readable at once.
CREATE TABLE public.analytics_ro_probe (id int);
INSERT INTO public.analytics_ro_probe VALUES (1);
SELECT is(public.ro_count('analytics_ro', 'SELECT count(*) FROM public.analytics_ro_probe'), 1::bigint,
  'D1: a table created later is readable by analytics_ro without any further grant');

-- ---------------------------------------------------------------------------
-- McpQueryLog
-- ---------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public."McpQueryLog"'::regclass),
  'McpQueryLog has RLS on');
SELECT is((SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'McpQueryLog'), 0::bigint,
  'McpQueryLog has no policy: only the service role reads or writes it');

INSERT INTO public."McpQueryLog" (clerk_user_id, tool, sql) VALUES ('clerk_test', 'query', 'select 1');
SELECT is(
  public.ro_run('authenticated', $q$INSERT INTO public."McpQueryLog" (clerk_user_id, tool) VALUES ('x', 'query')$q$),
  '42501',
  'a signed-in app user cannot write to McpQueryLog');
SELECT is(public.ro_count('authenticated', 'SELECT count(*) FROM public."McpQueryLog"'), 0::bigint,
  'a signed-in app user reads no row of McpQueryLog');

SELECT * FROM finish();
ROLLBACK;
