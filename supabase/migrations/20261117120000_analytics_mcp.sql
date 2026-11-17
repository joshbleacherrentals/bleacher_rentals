-- =============================================================
-- Analytics MCP: staff ask Claude questions about our data, read-only
-- (docs/specs/analytics-mcp.md)
--
-- Two things:
--   * the database role analytics_ro, which the MCP endpoint (/api/mcp) connects as. It can SELECT
--     from every table in public, now and later, and from nothing else. D1: no views, no per-table
--     list to maintain. D4: except QboConnections, whose encrypted_token_value is a credential;
--   * the table McpQueryLog, the audit log: who asked what, and when. Online only, not synced.
--
-- Decided by the spec:
--   * the role has NO password and cannot log in here. The password is set by hand in production
--     (spec §7: ALTER ROLE analytics_ro LOGIN PASSWORD '...'), so no secret is in the repository;
--   * BYPASSRLS: the app's policies are written for the `authenticated` role; without it the role would
--     see empty tables;
--   * default_transaction_read_only and the timeouts are the role's defaults. The endpoint also opens
--     every query in BEGIN READ ONLY, which is what stops a SECURITY DEFINER function from writing;
--   * the default privileges cover tables the postgres role creates later (every migration), so a new
--     table is readable at once. A new table that holds a credential must be revoked by hand, as
--     QboConnections is below. McpQueryLog is revoked too (D5): the role must not read the log;
--   * McpQueryLog has RLS on and no policy: only the service role (the app's server) reads or writes it.
--
-- It can run twice. Deploy order: this migration, then the app.
-- =============================================================

-- ---------------------------------------------------------------------------
-- The audit log (created first, so the grant below covers it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public."McpQueryLog" (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  user_id       uuid        REFERENCES public."Users"(id) ON DELETE SET NULL,
  clerk_user_id text        NOT NULL,
  tool          text        NOT NULL,
  sql           text,
  row_count     integer,
  truncated     boolean     NOT NULL DEFAULT false,
  duration_ms   integer,
  error         text,
  CONSTRAINT mcp_query_log_tool_check CHECK (tool IN ('query', 'describe_schema', 'access'))
);

CREATE INDEX IF NOT EXISTS mcp_query_log_created_at_idx ON public."McpQueryLog" (created_at DESC);

ALTER TABLE public."McpQueryLog" ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- The read-only role
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'analytics_ro') THEN
    CREATE ROLE analytics_ro NOLOGIN BYPASSRLS;
  END IF;
END
$$;

ALTER ROLE analytics_ro SET default_transaction_read_only = on;
ALTER ROLE analytics_ro SET statement_timeout = '15s';
ALTER ROLE analytics_ro SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE analytics_ro CONNECTION LIMIT 5;

GRANT USAGE ON SCHEMA public TO analytics_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO analytics_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO analytics_ro;

-- D4: the one credential table.
REVOKE ALL ON public."QboConnections" FROM analytics_ro;
-- D5: the audit log is for administrators, not for a colleague's question to Claude. Without this,
-- anyone could read what everybody else asked.
REVOKE ALL ON public."McpQueryLog" FROM analytics_ro;
