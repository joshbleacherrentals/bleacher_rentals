-- Real-user performance events — see docs/specs/perf-telemetry-pipeline.md.
--
-- WHY UNLOGGED
-- The `powersync` publication is FOR ALL TABLES. A normal table would send every insert (and
-- the nightly delete below) through the WAL and the PowerSync replication slot, loading the
-- very system these events measure. An UNLOGGED table is not written to the WAL and cannot be
-- part of a publication, so PowerSync never sees it. Checked on Postgres 17.6 on 2026-10-08.
--
-- The cost, accepted in the spec: after a Postgres crash the table comes back empty, and it
-- is not in backups. For 30 days of telemetry that is a gap in a graph, not a loss of
-- business data.
--
-- WHO CAN TOUCH IT
-- Row level security is on and there is deliberately NO policy, so `anon` and `authenticated`
-- read nothing and insert nothing. The only writer is /api/telemetry, with the service-role
-- key; the only reader is a developer in Supabase Studio. The table is not in AppSchema.ts or
-- sync_rules.yaml, so no device ever receives a row of it. There is no user column: the route
-- discards the Clerk id after checking the session.

CREATE UNLOGGED TABLE public."PerfEvents" (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at   timestamptz NOT NULL DEFAULT now(),
  event_at      timestamptz NOT NULL,
  name          text        NOT NULL,
  duration_ms   double precision,
  outcome       text        NOT NULL CHECK (outcome IN ('ok', 'error')),
  error_kind    text,
  session_id    uuid        NOT NULL,
  tab_role      text        NOT NULL CHECK (tab_role IN ('leader', 'follower', 'unknown')),
  app_version   text        NOT NULL,
  env           text        NOT NULL,
  browser       text,
  os            text,
  device_class  text,
  network_type  text,
  rtt_ms        integer,
  roles         text[],
  attrs         jsonb
);

CREATE INDEX "PerfEvents_name_received_idx" ON public."PerfEvents" (name, received_at);

ALTER TABLE public."PerfEvents" ENABLE ROW LEVEL SECURITY;

-- Retention: 30 days of raw events. Same mechanism as 20260918150000_schedule_delete_past_alerts.sql;
-- pg_cron schedules in UTC and records every run in cron.job_run_details.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'prune-perf-events',
  '20 5 * * *',
  $$DELETE FROM public."PerfEvents" WHERE received_at < now() - interval '30 days';$$
);
