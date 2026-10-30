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

-- Where an email is in its life. 'success' is the normal state: an email pulled from Gmail (received
-- or sent) and an email the app has sent. The other three are an email the app is writing or sending:
--   draft    saved but not sent
--   sending  the app has created the row at once, and the server is sending it
--   error    sending failed; error_text says why
-- An unsent email exists only in its writer's mailbox and has no Google ids until the server has sent
-- it and filled them in.
create type public.email_message_status as enum ('draft', 'sending', 'success', 'error');

create table public."EmailMessages" (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),

  -- The company mailbox this copy lives in, e.g. 'paul@bleacherrentals.com'.
  mailbox text not null,

  -- Google's ids. google_id and google_thread_id are null while an email has not been sent yet.
  google_message_id text,
  google_id text,
  google_thread_id text,
  -- Copied from the In-Reply-To and References headers: the Message-ID of the email this one answers,
  -- and the chain of Message-IDs before it. A reply sends both back so mail clients thread it. Null
  -- for an email that replies to nothing.
  google_in_reply_to text,
  google_references text,

  from_address text,
  to_addresses text,
  cc_addresses text,
  subject text,
  date timestamp with time zone,
  snippet text,
  -- Relative to us: 'sent' when someone at the company wrote it, otherwise 'received'.
  direction text not null,

  status public.email_message_status not null default 'success',
  -- Why sending failed, shown on the email. Null unless status is 'error'.
  error_text text,

  -- This email's saved body (EmailMessageDetails points back at this row). Null until someone has
  -- opened the email. Set once by the app; see the update policy at the bottom of this file. Its
  -- foreign key is added below, once EmailMessageDetails exists.
  email_message_details_uuid uuid,

  constraint EmailMessages_pkey primary key (id),
  -- A Gmail id is only unique within its mailbox, so a copy is identified by both. Unsent emails
  -- have no google_id, and nulls do not clash.
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

-- The signed-in user's email address, lowercased (null for an inactive or unknown user). A mailbox
-- is a company email address, so this is how a row is known to be someone's own.
create or replace function public.get_current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.email)
  from "Users" u
  where u.id = public.get_current_user_uuid()
  limit 1;
$$;

-- Access. Every signed-in user can read. A sent or received email ('success') can be inserted by
-- anyone (that is how a pull saves them) and afterwards never changed or removed through the API;
-- the service role (the server) still can. Same pattern as ChangeLog (select: everyone) and
-- EventChangeLog (insert: everyone, no update or delete).
--
-- An unsent email (draft, sending, error) is the exception, because the person writing it has to be
-- able to create, change and discard it from their own device: a user can insert one, update it and
-- delete it, but only in their own mailbox. The server is what marks an email 'success' and fills in
-- its Google ids, so a user can never make one look sent.
--
-- One thing to know about inserts: PowerSync uploads a new row as an upsert. For a row that does not
-- exist yet that is a plain insert and passes. Uploading the same row a second time (a retry after a
-- half-finished upload) hits the update path, which a 'success' row refuses.

create policy "email_messages_select" on public."EmailMessages"
  as permissive for select to authenticated
  using (true);

create policy "email_messages_insert" on public."EmailMessages"
  as permissive for insert to authenticated
  with check (
    status = 'success'
    or (status in ('draft', 'sending') and lower(mailbox) = public.get_current_user_email())
  );

-- Opening an email saves its body in EmailMessageDetails and then sets email_message_details_uuid on
-- the EmailMessages row. The policy lets a row be updated only while that pointer is still empty,
-- and the trigger below refuses anything else a signed-in user tries to change on a 'success' row
-- (the service role is not held to it). So the pointer can be set once, to the email's own details
-- row, and nothing else about a received or sent email can be edited.
create policy "email_messages_link_details" on public."EmailMessages"
  as permissive for update to authenticated
  using (email_message_details_uuid is null)
  with check (true);

-- The owner of an unsent email can change it (the trigger below limits what) and discard it.
create policy "email_messages_edit_own_unsent" on public."EmailMessages"
  as permissive for update to authenticated
  using (status <> 'success' and lower(mailbox) = public.get_current_user_email())
  with check (status <> 'success' and lower(mailbox) = public.get_current_user_email());

create policy "email_messages_delete_own_unsent" on public."EmailMessages"
  as permissive for delete to authenticated
  using (status <> 'success' and lower(mailbox) = public.get_current_user_email());

create function public.email_messages_guard_update()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated' then
    if old.status = 'success' then
      if (to_jsonb(new) - 'email_message_details_uuid') is distinct from
         (to_jsonb(old) - 'email_message_details_uuid') then
        raise exception 'Only email_message_details_uuid can be set on an EmailMessages row'
          using errcode = '42501';
      end if;
    else
      -- An unsent email: its owner's to edit, but it stays in their mailbox, and only the server
      -- can say it was sent or give it Google's ids.
      if lower(old.mailbox) is distinct from public.get_current_user_email() then
        raise exception 'You can only change your own unsent emails'
          using errcode = '42501';
      end if;
      if new.status = 'success' then
        raise exception 'Only the server can mark an email as sent'
          using errcode = '42501';
      end if;
      if (new.mailbox, new.direction, new.google_id, new.google_thread_id, new.google_message_id)
         is distinct from
         (old.mailbox, old.direction, old.google_id, old.google_thread_id, old.google_message_id) then
        raise exception 'The mailbox, direction and Google ids of an unsent email cannot be changed'
          using errcode = '42501';
      end if;
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

-- GmailMailboxSync: one row per company mailbox that the server keeps up to date from Gmail, whether
-- or not anyone in the app owns it (a shared inbox like sales@ has no Users row, and its mail with a
-- customer matters just as much). Gmail tells us a mailbox changed (a Pub/Sub push, see
-- /api/gmail/push) and the server asks what was added since `history_id`, matches each new email's
-- addresses to contacts, and saves the matches into EmailMessages and ContactEmailMessages. The rows
-- are made and kept by the server from Google's directory of the domain's mailboxes (the daily
-- /api/cron/gmail-watch), so a new mailbox is picked up without anyone adding it here.
--
-- Used only by the server, which reads and writes it with the service role: row-level security is on
-- and no policy gives anyone else access. It is not synced to devices.
create table public."GmailMailboxSync" (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),

  -- The mailbox address, lowercase, e.g. 'sales@bleacherrentals.com'.
  mailbox text not null,

  -- Gmail's history id of the last change this server has handled: where the next sync starts. Null
  -- until the mailbox is first watched or synced, which sets it to "now" (nothing before is fetched;
  -- "Pull from Gmail" on a contact backfills).
  history_id text,

  -- When Gmail stops pushing for this mailbox unless it is watched again (about 7 days out; the
  -- daily job renews it).
  watch_expires_at timestamp with time zone,

  last_synced_at timestamp with time zone,
  -- Why the last watch or sync failed (a suspended account, say). Null after a success.
  last_error text,

  constraint GmailMailboxSync_pkey primary key (id),
  constraint GmailMailboxSync_mailbox_unique unique (mailbox),
  constraint GmailMailboxSync_mailbox_lowercase check (mailbox = lower(mailbox))
);

alter table public."GmailMailboxSync" enable row level security;
