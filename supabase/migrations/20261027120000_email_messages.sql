-- EmailMessages: the headers and snippet of emails pulled from Gmail, one row per mailbox copy.
-- ContactEmailMessages: which contacts an email message involves.
--
-- Starting small: no body and no attachments. Bodies and attachments are meant to be fetched from
-- Gmail on demand, not stored here.
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

create policy "contact_email_messages_select" on public."ContactEmailMessages"
  as permissive for select to authenticated
  using (true);

create policy "contact_email_messages_insert" on public."ContactEmailMessages"
  as permissive for insert to authenticated
  with check (true);
