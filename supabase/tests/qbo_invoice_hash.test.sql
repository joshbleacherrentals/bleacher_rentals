-- ============================================================================
-- Tests for the QuickBooks invoice link columns and the current hash on Events
-- Migration: 20261022130000_qbo_invoice_link_and_hash.sql
-- Spec:      docs/specs/qbo-invoice-01-link-and-hash.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/qbo_invoice_hash.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the five columns exist with the right defaults; a new event gets a qbo_invoice_hash;
--   * every field the invoice is built from flips qbo_invoice_hash, and a field it is not built
--     from leaves it alone; reverting a change restores the hash;
--   * the finance contact (not the plain contact) is the billed customer once set;
--   * the server-written columns do not change the hash and cause no trigger recursion;
--   * content_hash and contract_hash are computed exactly as before, and a change that moves only
--     qbo_invoice_hash leaves an active signature active;
--   * an accountant is fenced from the new columns by the existing Events guard (42501);
--   * the backfill leaves no event without a qbo_invoice_hash.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(48);

-- Runs `change`, reports whether qbo_invoice_hash moved, runs `revert` and reports whether the
-- original hash came back: 'flips', 'same', or 'flips, no restore' / 'same, but moved on revert'.
CREATE FUNCTION public.test_hash_effect(p_event uuid, change text, revert text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE h0 text; h1 text; h2 text;
BEGIN
  SELECT qbo_invoice_hash INTO h0 FROM public."Events" WHERE id = p_event;
  EXECUTE change;
  SELECT qbo_invoice_hash INTO h1 FROM public."Events" WHERE id = p_event;
  EXECUTE revert;
  SELECT qbo_invoice_hash INTO h2 FROM public."Events" WHERE id = p_event;
  IF h2 IS DISTINCT FROM h0 THEN RETURN 'no restore'; END IF;
  RETURN CASE WHEN h1 IS DISTINCT FROM h0 THEN 'flips' ELSE 'same' END;
END;
$$;

-- Rows affected by a statement, run as the current (RLS-bound) role.
CREATE FUNCTION public.test_rows_affected(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ═══ THE COLUMNS ════════════════════════════════════════════════════════════

SELECT is(
  (SELECT string_agg(column_name || ':' || data_type, ',' ORDER BY column_name)
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name LIKE 'qbo\_invoice\_%'),
  'qbo_invoice_connection_uuid:uuid,qbo_invoice_hash:text,qbo_invoice_id:text,qbo_invoice_mismatch:boolean,qbo_invoice_sent_hash:text',
  'Events has the five qbo_invoice_* columns with the specified types');

SELECT is(
  (SELECT is_nullable || '/' || coalesce(column_default, '-') FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'qbo_invoice_mismatch'),
  'NO/false', 'qbo_invoice_mismatch is not null and defaults to false');

SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name LIKE 'qbo\_invoice\_%'
     AND column_name <> 'qbo_invoice_mismatch' AND is_nullable = 'YES'),
  4, 'the other four are nullable');

SELECT is(
  (SELECT count(*)::int FROM pg_constraint c
   WHERE c.conrelid = 'public."Events"'::regclass AND c.contype = 'f'
     AND c.confrelid = 'public."QboConnections"'::regclass AND c.confdeltype = 'r'
     AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                           WHERE attrelid = 'public."Events"'::regclass AND attname = 'qbo_invoice_connection_uuid')]),
  1, 'qbo_invoice_connection_uuid references QboConnections ON DELETE RESTRICT');

SELECT is(
  (SELECT count(*)::int FROM pg_attribute a
   WHERE a.attrelid = 'public."Events"'::regclass AND a.attname LIKE 'qbo\_invoice\_%'
     AND col_description(a.attrelid, a.attnum) IS NOT NULL),
  5, 'each column has a comment');

-- ═══ FIXTURE ════════════════════════════════════════════════════════════════

INSERT INTO public."EventTypes" (name) VALUES ('QIH City'), ('QIH Rural');
INSERT INTO public."Contacts" (first_name, last_name, email, phone)
VALUES ('Plain', 'Contact', 'plain@test.com', '111');
INSERT INTO public."Contacts" (first_name, last_name, email, phone)
VALUES ('Fin', 'Contact', 'fin@test.com', '222');
INSERT INTO public."Addresses" (street, city, state_province, zip_postal)
VALUES ('1 Main St', 'Austin', 'TX', '73301');

SELECT id AS type_a FROM public."EventTypes" WHERE name = 'QIH City' \gset
SELECT id AS type_b FROM public."EventTypes" WHERE name = 'QIH Rural' \gset
SELECT id AS contact_plain FROM public."Contacts" WHERE email = 'plain@test.com' \gset
SELECT id AS contact_fin FROM public."Contacts" WHERE email = 'fin@test.com' \gset
SELECT id AS addr FROM public."Addresses" WHERE street = '1 Main St' \gset

INSERT INTO public."TermsAndConditions" (name, html_content) VALUES ('QIH terms', '<p>terms</p>')
RETURNING id AS terms \gset

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, external_notes, tax_percent, tax_amount_cents,
                             event_type_uuid, contact_uuid, address_uuid, invoice_number,
                             terms_and_conditions_uuid)
VALUES ('QIH Event', '2026-07-01', '2026-07-03', false, false, 'booked', 'note A', 8, 800,
        :'type_a', :'contact_plain', :'addr', '100000001', :'terms')
RETURNING id AS ev \gset

INSERT INTO public."EventLineItems" (event_uuid, header, quantity, value_cents, currency, is_template, deleted)
VALUES (:'ev', 'Bleachers', 2, 5000, 'USD', false, false)
RETURNING id AS line \gset

-- ═══ A NEW EVENT ════════════════════════════════════════════════════════════

SELECT isnt(
  (SELECT qbo_invoice_hash FROM public."Events" WHERE id = :'ev'), NULL,
  'a new event has a non-null qbo_invoice_hash');
SELECT is(
  (SELECT (qbo_invoice_id IS NULL AND qbo_invoice_sent_hash IS NULL
           AND qbo_invoice_connection_uuid IS NULL AND qbo_invoice_mismatch = false) FROM public."Events" WHERE id = :'ev'),
  true, '...with no invoice id, sent hash or connection, and the mismatch flag false');

CREATE TEMP TABLE before_hashes AS
  SELECT content_hash, contract_hash, qbo_invoice_hash FROM public."Events" WHERE id = :'ev';

-- ═══ EVERY FIELD THE INVOICE IS BUILT FROM FLIPS THE HASH ═══════════════════

SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."EventLineItems" SET value_cents = 6000 WHERE id = %L', :'line'),
  format('UPDATE public."EventLineItems" SET value_cents = 5000 WHERE id = %L', :'line')),
  'flips', 'a line item''s price flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."EventLineItems" SET quantity = 3 WHERE id = %L', :'line'),
  format('UPDATE public."EventLineItems" SET quantity = 2 WHERE id = %L', :'line')),
  'flips', 'a line item''s quantity flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."EventLineItems" SET deleted = true WHERE id = %L', :'line'),
  format('UPDATE public."EventLineItems" SET deleted = false WHERE id = %L', :'line')),
  'flips', 'soft-deleting a line item flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET tax_percent = 9 WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET tax_percent = 8 WHERE id = %L', :'ev')),
  'flips', 'tax_percent flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET tax_amount_cents = 900 WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET tax_amount_cents = 800 WHERE id = %L', :'ev')),
  'flips', 'tax_amount_cents flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET is_tax_overridden = true WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET is_tax_overridden = false WHERE id = %L', :'ev')),
  'flips', 'is_tax_overridden flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Contacts" SET first_name = ''Renamed'' WHERE id = %L', :'contact_plain'),
  format('UPDATE public."Contacts" SET first_name = ''Plain'' WHERE id = %L', :'contact_plain')),
  'flips', 'the contact''s first name flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Contacts" SET last_name = ''Renamed'' WHERE id = %L', :'contact_plain'),
  format('UPDATE public."Contacts" SET last_name = ''Contact'' WHERE id = %L', :'contact_plain')),
  'flips', 'the contact''s last name flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET finance_contact_uuid = %L WHERE id = %L', :'contact_fin', :'ev'),
  format('UPDATE public."Events" SET finance_contact_uuid = NULL WHERE id = %L', :'ev')),
  'flips', 'setting finance_contact_uuid flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Addresses" SET street = ''2 Elm St'' WHERE id = %L', :'addr'),
  format('UPDATE public."Addresses" SET street = ''1 Main St'' WHERE id = %L', :'addr')),
  'flips', 'the venue''s street flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET invoice_number = ''100000002'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET invoice_number = ''100000001'' WHERE id = %L', :'ev')),
  'flips', 'invoice_number flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET event_start = ''2026-07-02'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET event_start = ''2026-07-01'' WHERE id = %L', :'ev')),
  'flips', 'event_start flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET event_name = ''QIH Renamed'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET event_name = ''QIH Event'' WHERE id = %L', :'ev')),
  'flips', 'event_name (the title) flips it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET event_type_uuid = %L WHERE id = %L', :'type_b', :'ev'),
  format('UPDATE public."Events" SET event_type_uuid = %L WHERE id = %L', :'type_a', :'ev')),
  'flips', 'event_type_uuid flips it');

-- ═══ THE DUE DATE ═══════════════════════════════════════════════════════════
-- No installment: the due date is event_start. One that is later changes it.

INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps)
VALUES (:'ev', '2026-08-01', 'USD', 10000)
RETURNING id AS inst \gset
-- (the insert above is itself the "adding a later installment" change; the hash moved from the
-- before_hashes snapshot)
SELECT isnt(
  (SELECT qbo_invoice_hash FROM public."Events" WHERE id = :'ev'),
  (SELECT qbo_invoice_hash FROM before_hashes),
  'adding an installment due after event_start changes it (it was event_start before)');

SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."PaymentInstallments" SET due_date = ''2026-09-01'' WHERE id = %L', :'inst'),
  format('UPDATE public."PaymentInstallments" SET due_date = ''2026-08-01'' WHERE id = %L', :'inst')),
  'flips', 'the last installment''s due_date flips it');

-- Two installments: only the latest due date counts.
INSERT INTO public."PaymentInstallments" (event_uuid, due_date, currency, percentage_bps)
VALUES (:'ev', '2026-07-15', 'USD', 0)
RETURNING id AS inst2 \gset
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."PaymentInstallments" SET due_date = ''2026-07-20'' WHERE id = %L', :'inst2'),
  format('UPDATE public."PaymentInstallments" SET due_date = ''2026-07-15'' WHERE id = %L', :'inst2')),
  'same', 'an earlier installment''s due date does not change it');
DELETE FROM public."PaymentInstallments" WHERE id = :'inst2';
DELETE FROM public."PaymentInstallments" WHERE id = :'inst';

SELECT is(
  (SELECT qbo_invoice_hash FROM public."Events" WHERE id = :'ev'),
  (SELECT qbo_invoice_hash FROM before_hashes),
  'with no installment again the hash is back to the event_start fallback (deterministic)');

-- ═══ THE BILLED CUSTOMER ════════════════════════════════════════════════════

UPDATE public."Events" SET finance_contact_uuid = :'contact_fin' WHERE id = :'ev';
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Contacts" SET first_name = ''Renamed'' WHERE id = %L', :'contact_plain'),
  format('UPDATE public."Contacts" SET first_name = ''Plain'' WHERE id = %L', :'contact_plain')),
  'same', 'with a finance contact set, renaming the plain contact does not flip it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Contacts" SET first_name = ''Renamed'' WHERE id = %L', :'contact_fin'),
  format('UPDATE public."Contacts" SET first_name = ''Fin'' WHERE id = %L', :'contact_fin')),
  'flips', '...and renaming the finance contact does');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Contacts" SET last_name = ''Renamed'' WHERE id = %L', :'contact_fin'),
  format('UPDATE public."Contacts" SET last_name = ''Contact'' WHERE id = %L', :'contact_fin')),
  'flips', '...in the last name too');
UPDATE public."Events" SET finance_contact_uuid = NULL WHERE id = :'ev';

-- ═══ FIELDS THE INVOICE IS NOT BUILT FROM LEAVE IT ALONE ════════════════════

SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET external_notes = ''note B'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET external_notes = ''note A'' WHERE id = %L', :'ev')),
  'same', 'external_notes does not flip it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET po_number = ''PO-9'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET po_number = NULL WHERE id = %L', :'ev')),
  'same', 'po_number does not flip it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET internal_notes = ''secret'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET internal_notes = NULL WHERE id = %L', :'ev')),
  'same', 'internal_notes does not flip it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET quote_valid_till = ''2026-12-31'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET quote_valid_till = NULL WHERE id = %L', :'ev')),
  'same', 'quote_valid_till does not flip it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Contacts" SET email = ''other@test.com'' WHERE id = %L', :'contact_plain'),
  format('UPDATE public."Contacts" SET email = ''plain@test.com'' WHERE id = %L', :'contact_plain')),
  'same', 'the contact''s email does not flip it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Contacts" SET phone = ''999'' WHERE id = %L', :'contact_plain'),
  format('UPDATE public."Contacts" SET phone = ''111'' WHERE id = %L', :'contact_plain')),
  'same', 'the contact''s phone does not flip it');

INSERT INTO public."Companies" (company_name) VALUES ('QIH Co') RETURNING id AS company \gset
UPDATE public."Contacts" SET company_uuid = :'company' WHERE id = :'contact_plain';
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Companies" SET company_name = ''QIH Renamed Co'' WHERE id = %L', :'company'),
  format('UPDATE public."Companies" SET company_name = ''QIH Co'' WHERE id = %L', :'company')),
  'same', 'a company''s name does not flip it');
SELECT is(public.test_hash_effect(:'ev',
  format('UPDATE public."Events" SET event_end = ''2026-07-09'' WHERE id = %L', :'ev'),
  format('UPDATE public."Events" SET event_end = ''2026-07-03'' WHERE id = %L', :'ev')),
  'same', 'event_end does not flip it');

-- ═══ DETERMINISTIC ══════════════════════════════════════════════════════════

SELECT is(
  (SELECT qbo_invoice_hash FROM public."Events" WHERE id = :'ev'),
  (SELECT qbo_invoice_hash FROM before_hashes),
  'after all the changes and reverts the hash is the original one');

-- ═══ THE SERVER-WRITTEN COLUMNS ═════════════════════════════════════════════
-- Written as the table owner (the service role is not 'authenticated' either): no hash change,
-- no error from trigger recursion.

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('QIH Conn', 'x') RETURNING id AS conn \gset

SELECT lives_ok(
  format($q$UPDATE public."Events" SET qbo_invoice_id = '42', qbo_invoice_connection_uuid = %L,
            qbo_invoice_sent_hash = 'abc', qbo_invoice_mismatch = true WHERE id = %L$q$, :'conn', :'ev'),
  'the owner can write the four server-written columns without a recursion error');
SELECT is(
  (SELECT qbo_invoice_hash FROM public."Events" WHERE id = :'ev'),
  (SELECT qbo_invoice_hash FROM before_hashes),
  '...and qbo_invoice_hash is unchanged by it');
SELECT is(
  (SELECT qbo_invoice_id || '/' || qbo_invoice_sent_hash || '/' || qbo_invoice_mismatch::text
   FROM public."Events" WHERE id = :'ev'),
  '42/abc/true', '...and the values are stored');

-- ═══ THE EXISTING TWO HASHES ARE UNTOUCHED ══════════════════════════════════

SELECT is(
  (SELECT (e.content_hash = h.content_hash AND e.contract_hash = h.contract_hash)
   FROM public."Events" e, before_hashes h WHERE e.id = :'ev'),
  true, 'content_hash and contract_hash are back to their snapshot after the same sequence');

-- That the two hashes equal what the pre-migration function produced cannot be asserted from a
-- file that runs after the migration; the dry-run compares every event's hashes before and after.

-- ═══ SIGNATURES ═════════════════════════════════════════════════════════════

INSERT INTO public."ContractSignatures" (event_uuid, terms_and_conditions_uuid, signer_name,
                                         status, signed_contract_hash)
SELECT :'ev', :'terms', 'Jordan Ellis', 'active', contract_hash FROM public."Events" WHERE id = :'ev';

UPDATE public."Events" SET is_tax_overridden = true WHERE id = :'ev';
SELECT is(
  (SELECT status FROM public."ContractSignatures" WHERE event_uuid = :'ev'),
  'active', 'a change that moves only qbo_invoice_hash (is_tax_overridden) leaves the signature active');
UPDATE public."Events" SET is_tax_overridden = false WHERE id = :'ev';

-- Control: a change that moves contract_hash does invalidate, so the check above is not vacuous.
UPDATE public."EventLineItems" SET value_cents = 7000 WHERE id = :'line';
SELECT is(
  (SELECT status FROM public."ContractSignatures" WHERE event_uuid = :'ev'),
  'invalidated', '...whereas a price change invalidates it (control)');
UPDATE public."EventLineItems" SET value_cents = 5000 WHERE id = :'line';

-- ═══ THE ACCOUNTANT GUARD ═══════════════════════════════════════════════════

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Qih', 'Acct', 'qih_acct@test.com', 'clerk_qih_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

CREATE TEMP TABLE guard_before AS SELECT * FROM public."Events" WHERE id = :'ev';
GRANT SELECT ON guard_before TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qih_acct')::text, true);

SELECT throws_ok(
  format('UPDATE public."Events" SET qbo_invoice_id = ''99'' WHERE id = %L', :'ev'),
  '42501', NULL, 'an accountant cannot change qbo_invoice_id (refused by the guard)');
SELECT throws_ok(
  format('UPDATE public."Events" SET qbo_invoice_mismatch = false WHERE id = %L', :'ev'),
  '42501', NULL, 'an accountant cannot change qbo_invoice_mismatch');

RESET ROLE;

SELECT is(
  (SELECT qbo_invoice_id || '/' || qbo_invoice_mismatch::text FROM public."Events" WHERE id = :'ev'),
  '42/true', 'the row is read back unchanged after the refused attempts');

-- ═══ THE FINANCE-CONTACT TRIGGER IN ISOLATION ═══════════════════════════════
-- The Contacts trigger must recompute events that name the contact as finance contact only.

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, finance_contact_uuid, contact_uuid)
VALUES ('QIH Fin Only', '2026-07-01', '2026-07-02', false, false, 'quoted', :'contact_fin', :'contact_plain')
RETURNING id AS ev2 \gset
UPDATE public."Events" SET qbo_invoice_hash = 'stale' WHERE id = :'ev2';
UPDATE public."Contacts" SET first_name = 'Fin2' WHERE id = :'contact_fin';
SELECT isnt(
  (SELECT qbo_invoice_hash FROM public."Events" WHERE id = :'ev2'), 'stale',
  'editing a finance contact recomputes the events that bill it');

-- ═══ BACKFILL ═══════════════════════════════════════════════════════════════
-- Every event, including ones with no contact, address or line items, has a hash.

INSERT INTO public."Events" (event_name, event_start, event_end, lenient, must_be_clean, event_status)
VALUES ('QIH Bare', '2026-07-01', '2026-07-02', false, false, 'quoted');
SELECT is(
  (SELECT count(*)::int FROM public."Events" WHERE qbo_invoice_hash IS NULL),
  0, 'no event has a null qbo_invoice_hash (backfilled, and new bare ones get one)');

SELECT * FROM finish();
ROLLBACK;
