-- Runs delete_past_alerts() on a schedule inside Postgres — see docs/specs/no-past-alerts.md.
--
-- WHY NOT THE VERCEL CRON
-- The Vercel Hobby plan allows one run a day, fires it anywhere within the scheduled hour, and
-- keeps runtime logs for one hour, so a failed run is effectively invisible. pg_cron comes with the
-- Supabase plan we already pay for and records every run in cron.job_run_details, which is queryable
-- with SQL forever. The cleanup is pure SQL, so the database is where it belongs. The Vercel cron
-- keeps the work that is actually TypeScript (Work Tracker "Pending Acceptance").

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_cron schedules in the server's timezone, which is UTC. 05:10 UTC is 00:10 or 01:10 in Toronto
-- depending on daylight saving — always just after the Toronto day rolls over, which is what decides
-- whether an alert is past.
SELECT cron.schedule(
  'delete-past-alerts',
  '10 5 * * *',
  $$SELECT public.delete_past_alerts();$$
);

-- cron.job_run_details has no retention on any Supabase tier and grows forever, so it prunes itself.
-- Sundays at 05:30 UTC, keeping 30 days — enough history to answer "has it run every day this
-- month?" without the table becoming the biggest thing in the database.
SELECT cron.schedule(
  'prune-cron-job-run-details',
  '30 5 * * 0',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '30 days';$$
);
