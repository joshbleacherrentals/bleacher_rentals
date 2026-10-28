-- EmailMessages: the headers and snippet of emails pulled from Gmail, one row per mailbox copy.
-- ContactEmailMessages: which contacts an email message involves.
-- EmailMessageDetails: the body of an email, saved the first time someone opens it.
-- BlockedCustomerEmails: customer addresses the team has chosen to block. Everyone can see the list;
-- each row can only be changed or removed by the person who added it.
--
-- Starting small: no attachments. An email's body is not kept on EmailMessages: it is fetched from
-- Gmail the first time someone opens the email and saved in EmailMessageDetails.
--
-- One email that sits in two mailboxes is two EmailMessages rows. They share google_message_id (the
-- email's own Message-ID header) and differ in mailbox, google_id (Gmail's id for that mailbox's copy)
-- and, usually, google_thread_id: Gmail ids belong to one mailbox. To open an email's body later, ask
-- Gmail as `mailbox` for `google_id`. Link a contact to the email once, not to every copy.
--
-- from_address / to_addresses / cc_addresses hold the header as Gmail returns it, e.g.
-- 'Pat Smith <pat@xyz.com>, Alex <alex@xyz.com>'. They are not named from / to because those are
-- reserved words in SQL.
--
-- The `powersync` publication is FOR ALL TABLES, so nothing has to be added to it here. The sync
-- rules (br_powersync) decide who receives these rows.

create table public."EmailMessages" (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),

  -- The company mailbox this copy lives in, e.g. 'paul@bleacherrentals.com'.
  mailbox text not null,

  -- Google's ids
  google_message_id text,
  google_id text not null,
  google_thread_id text not null,

  from_address text,
  to_addresses text,
  cc_addresses text,
  subject text,
  date timestamp with time zone,
  snippet text,
  -- Relative to us: 'sent' when someone at the company wrote it, otherwise 'received'.
  direction text not null,

  -- This email's saved body (EmailMessageDetails points back at this row). Null until someone has
  -- opened the email. Set once by the app; see the update policy at the bottom of this file. Its
  -- foreign key is added below, once EmailMessageDetails exists.
  email_message_details_uuid uuid,

  constraint EmailMessages_pkey primary key (id),
  -- A Gmail id is only unique within its mailbox, so a copy is identified by both.
  constraint EmailMessages_mailbox_google_id_unique unique (mailbox, google_id),
  constraint EmailMessages_direction_check check (direction in ('sent', 'received'))
);

create index "EmailMessages_google_message_id_idx"
  on public."EmailMessages" using btree (google_message_id);

alter table public."EmailMessages" enable row level security;

-- Many to many: an email can involve several contacts (someone cc'd, two customers on a thread),
-- and a contact has many emails.
create table public."ContactEmailMessages" (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),

  contact_uuid uuid not null,
  email_message_uuid uuid not null,

  constraint ContactEmailMessages_pkey primary key (id),
  constraint ContactEmailMessages_contact_uuid_fkey foreign key (contact_uuid)
    references public."Contacts"(id) on delete cascade,
  constraint ContactEmailMessages_email_message_uuid_fkey foreign key (email_message_uuid)
    references public."EmailMessages"(id) on delete cascade,
  -- A contact is linked to a message once. Also serves "all messages for this contact".
  constraint ContactEmailMessages_contact_message_unique unique (contact_uuid, email_message_uuid)
);

-- "Which contacts is this message linked to" and cascading deletes from EmailMessages.
create index "ContactEmailMessages_email_message_uuid_idx"
  on public."ContactEmailMessages" using btree (email_message_uuid);

alter table public."ContactEmailMessages" enable row level security;

-- One row per EmailMessages row (a mailbox copy). No row means the body has not been loaded yet.
-- Kept apart from EmailMessages so the email list stays small, and so loading a body is an insert
-- that happens once: nobody can update a row. More columns come as they are needed.
create table public."EmailMessageDetails" (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),

  email_message_uuid uuid not null,

  -- The plain-text version, if the email has one.
  body_text text,
  -- The HTML version exactly as sent. Untrusted: sanitize before rendering it.
  body_html text,

  constraint EmailMessageDetails_pkey primary key (id),
  constraint EmailMessageDetails_email_message_uuid_fkey foreign key (email_message_uuid)
    references public."EmailMessages"(id) on delete cascade,
  -- One details row per email message. Also serves "the details of this message".
  constraint EmailMessageDetails_email_message_uuid_unique unique (email_message_uuid)
);

alter table public."EmailMessageDetails" enable row level security;

-- The two tables point at each other, so this side of the link can only be added now.
alter table public."EmailMessages"
  add constraint EmailMessages_email_message_details_uuid_fkey foreign key (email_message_details_uuid)
    references public."EmailMessageDetails"(id) on delete set null;

create index "EmailMessages_email_message_details_uuid_idx"
  on public."EmailMessages" using btree (email_message_details_uuid);

-- Access. Every signed-in user can read and insert. There are no update or delete policies, so
-- nobody can change or remove a row through the API; the service role (the server) still can. Same
-- pattern as ChangeLog (select: everyone) and EventChangeLog (insert: everyone, no update or delete).
--
-- One thing to know about inserts: PowerSync uploads a new row as an upsert. For a row that does not
-- exist yet that is a plain insert and passes. Uploading the same row a second time (a retry after a
-- half-finished upload) hits the update path and is refused, because there is no update policy.

create policy "email_messages_select" on public."EmailMessages"
  as permissive for select to authenticated
  using (true);

create policy "email_messages_insert" on public."EmailMessages"
  as permissive for insert to authenticated
  with check (true);

-- The one exception to "nobody updates". Opening an email saves its body in EmailMessageDetails and
-- then sets email_message_details_uuid on the EmailMessages row. The policy lets a row be updated
-- only while that pointer is still empty, and the trigger below refuses anything else a signed-in
-- user tries to change (the service role is not held to it). So the pointer can be set once, to the
-- email's own details row, and nothing else about a row can be edited.
create policy "email_messages_link_details" on public."EmailMessages"
  as permissive for update to authenticated
  using (email_message_details_uuid is null)
  with check (true);

create function public.email_messages_guard_update()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if (to_jsonb(new) - 'email_message_details_uuid') is distinct from
       (to_jsonb(old) - 'email_message_details_uuid') then
      raise exception 'Only email_message_details_uuid can be set on an EmailMessages row'
        using errcode = '42501';
    end if;

    if new.email_message_details_uuid is not null and not exists (
      select 1
      from public."EmailMessageDetails" d
      where d.id = new.email_message_details_uuid
        and d.email_message_uuid = new.id
    ) then
      raise exception 'email_message_details_uuid must be this email''s own details row'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger email_messages_guard_update
  before update on public."EmailMessages"
  for each row execute function public.email_messages_guard_update();

create policy "contact_email_messages_select" on public."ContactEmailMessages"
  as permissive for select to authenticated
  using (true);

create policy "contact_email_messages_insert" on public."ContactEmailMessages"
  as permissive for insert to authenticated
  with check (true);

create policy "email_message_details_select" on public."EmailMessageDetails"
  as permissive for select to authenticated
  using (true);

create policy "email_message_details_insert" on public."EmailMessageDetails"
  as permissive for insert to authenticated
  with check (true);

-- A customer email address the team has blocked. Hard deletes only: remove the row to unblock.
create table public."BlockedCustomerEmails" (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),

  -- Who blocked it, and so the only person who can edit or remove the row. Filled in by the server
  -- when left out. No cascade: deleting a user should not quietly unblock their addresses.
  created_by_user_uuid uuid not null default public.get_current_user_uuid(),

  email text not null,

  constraint BlockedCustomerEmails_pkey primary key (id),
  constraint BlockedCustomerEmails_created_by_user_uuid_fkey foreign key (created_by_user_uuid)
    references public."Users"(id),
  constraint BlockedCustomerEmails_email_not_blank check (btrim(email) <> '')
);

-- An address is blocked once, whoever added it and however it is capitalized. Also serves "is this
-- address blocked".
create unique index "BlockedCustomerEmails_email_lower_idx"
  on public."BlockedCustomerEmails" using btree (lower(email));

create function public.blocked_customer_emails_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger blocked_customer_emails_touch_updated_at
  before update on public."BlockedCustomerEmails"
  for each row execute function public.blocked_customer_emails_touch_updated_at();

alter table public."BlockedCustomerEmails" enable row level security;

-- Everyone signed in can read and add. Editing or removing is limited to the row's creator.
-- get_current_user_uuid() is null for an inactive user, so they match no row and cannot write.
-- The update check also stops a creator from handing a row to someone else.
create policy "blocked_customer_emails_select" on public."BlockedCustomerEmails"
  as permissive for select to authenticated
  using (true);

create policy "blocked_customer_emails_insert" on public."BlockedCustomerEmails"
  as permissive for insert to authenticated
  with check (created_by_user_uuid = public.get_current_user_uuid());

create policy "blocked_customer_emails_update" on public."BlockedCustomerEmails"
  as permissive for update to authenticated
  using (created_by_user_uuid = public.get_current_user_uuid())
  with check (created_by_user_uuid = public.get_current_user_uuid());

create policy "blocked_customer_emails_delete" on public."BlockedCustomerEmails"
  as permissive for delete to authenticated
  using (created_by_user_uuid = public.get_current_user_uuid());
