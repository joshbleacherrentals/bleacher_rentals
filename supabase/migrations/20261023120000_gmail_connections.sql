-- GmailConnections: one Gmail mailbox per user, connected through Google OAuth.
--
-- encrypted_token_value holds the Google refresh token (encrypted by the app, same helper as
-- QboConnections). Only the server writes it, with the service role.
--
-- The `powersync` publication is FOR ALL TABLES, so nothing has to be added to it here. The
-- sync rules must NOT send encrypted_token_value to clients: the UI only needs to know that a
-- user is connected.

create table public."GmailConnections" (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  -- The mailbox address is not stored here: it is the user's own email on Users.
  user_uuid uuid not null,
  encrypted_token_value text not null,

  constraint GmailConnections_pkey primary key (id),
  -- One mailbox per user. Reconnecting replaces the row (upsert on user_uuid).
  constraint GmailConnections_user_uuid_unique unique (user_uuid),
  constraint GmailConnections_user_uuid_fkey foreign key (user_uuid)
    references public."Users"(id) on delete cascade
);

alter table public."GmailConnections" enable row level security;

-- A user reads only their own connection. There are no insert / update / delete policies:
-- the OAuth callback and disconnect run server-side with the service role, which bypasses RLS.
create policy "own_select" on public."GmailConnections"
  as permissive for select to authenticated
  using (user_uuid = public.get_current_user_uuid());

-- Row policies cannot hide a column, so take the token away at the privilege level. Supabase
-- grants new tables to anon / authenticated by default; leave authenticated only the
-- non-secret columns and no write access at all.
revoke all on table public."GmailConnections" from anon, authenticated;
grant select (id, created_at, updated_at, user_uuid) on public."GmailConnections" to authenticated;
