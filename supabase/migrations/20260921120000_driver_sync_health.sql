-- Sync Health: how many PowerSync buckets each driver's phone holds.
--
-- Context: br_driver/docs/specs/sync-bucket-limit.md. PSYNC_S2305 fires when a
-- connection exceeds max_parameter_query_results (2000 today, set in
-- br_powersync/config/powersync.yaml). The only place that knows the real
-- number is the device, so the driver app counts its own buckets after a sync
-- and writes the result here, through PowerSync, like any other local write.
--
-- Additive only: builds that predate this never write the columns, and they
-- stay NULL. NULL means "no report yet" — deliberately no default, because the
-- Sync Health page must be able to tell that apart from a real zero.
--
-- Access:
--   * write — the existing "driver_self_update" policy already limits a driver
--     to its own row, which is exactly what this needs; no new write policy.
--   * read  — developers are not in "drivers_select" (admin/AM/viewer), so they
--     get their own SELECT policy. Hiding the columns from other office roles
--     is done by the web sync rules, not here (RLS cannot hide columns).

alter table public."Drivers"
  add column bucket_count integer,
  add column sync_version integer,
  add column bucket_count_reported_at timestamptz;

alter table public."Drivers"
  add constraint drivers_bucket_count_non_negative
  check (bucket_count is null or bucket_count >= 0);

drop policy if exists "drivers_developer_select" on public."Drivers";

create policy "drivers_developer_select" on public."Drivers"
  as permissive for select to authenticated
  using ('developer' = any(public.get_user_roles()));
