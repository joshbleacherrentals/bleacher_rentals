-- Development email allowlist.
--
-- In the development environment (the green "Development" banner,
-- NEXT_PUBLIC_ENVIRONMENT=development) the server only sends an email to an address on this list.
-- Everything else — staging, production — ignores it. A migration runs everywhere, so the table
-- exists in production too; nothing reads it there.
--
-- Maintained by developers on /dev-tools/allowed-emails (a PowerSync page). The server reads it
-- with the service role, which bypasses RLS, so the policies below are only about who may see and
-- change the list from the app: developers, and nobody else.
--
-- Addresses are stored trimmed and lower-cased — the constraint enforces it, so the server's
-- case-insensitive comparison and the unique index agree about what "the same address" means.

create table public."DevAllowedEmails" (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  constraint "DevAllowedEmails_email_normalised"
    check (email <> '' and email = lower(btrim(email)))
);

create unique index "DevAllowedEmails_email_unique" on public."DevAllowedEmails" (email);

alter table public."DevAllowedEmails" enable row level security;

create policy "rbac_select" on public."DevAllowedEmails"
  as permissive for select to authenticated
  using (public.get_user_roles() && ARRAY['developer']::text[]);

create policy "rbac_insert" on public."DevAllowedEmails"
  as permissive for insert to authenticated
  with check (public.get_user_roles() && ARRAY['developer']::text[]);

create policy "rbac_update" on public."DevAllowedEmails"
  as permissive for update to authenticated
  using (public.get_user_roles() && ARRAY['developer']::text[])
  with check (public.get_user_roles() && ARRAY['developer']::text[]);

create policy "rbac_delete" on public."DevAllowedEmails"
  as permissive for delete to authenticated
  using (public.get_user_roles() && ARRAY['developer']::text[]);
