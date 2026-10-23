-- ============================================================================
-- Tests for the QuickBooks invoice link columns on Events
-- Migration: 20261022140000_qbo_invoice_link_and_hash.sql
-- Spec:      docs/specs/qbo-invoice-01-link-and-hash.md (§3, §7.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/qbo_invoice_hash.test.sql
--
-- (The file keeps its name from the days the migration also kept an invoice hash; the hash is gone.)
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- What it pins down:
--   * the six columns exist with the right types and defaults, and the two hash columns do not;
--   * the migration left recompute_quote_hashes() and the Contacts trigger as they were before it;
--   * the server-written columns cause no trigger recursion and change neither content_hash nor
--     contract_hash, and leave an active signature active;
--   * an accountant is fenced from the new columns by the existing Events guard (42501).
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(20);

-- ═══ THE COLUMNS ════════════════════════════════════════════════════════════

SELECT is(
  (SELECT string_agg(column_name || ':' || data_type, ',' ORDER BY column_name COLLATE "C")
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name LIKE 'qbo\_invoice\_%'),
  'qbo_invoice_check_failed_at:timestamp with time zone,qbo_invoice_checked_at:timestamp with time zone,qbo_invoice_connection_uuid:uuid,qbo_invoice_id:text,qbo_invoice_mismatch:boolean,qbo_invoice_mismatch_reasons:text',
  'Events has exactly the six qbo_invoice_* columns with the specified types (no hash columns)');

SELECT is(
  (SELECT is_nullable || '/' || coalesce(column_default, '-') FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name = 'qbo_invoice_mismatch'),
  'NO/false', 'qbo_invoice_mismatch is not null and defaults to false');

SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events' AND column_name LIKE 'qbo\_invoice\_%'
     AND column_name <> 'qbo_invoice_mismatch' AND is_nullable = 'YES'),
  5, 'the other five are nullable');

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
     AND NOT a.attisdropped AND col_description(a.attrelid, a.attnum) IS NOT NULL),
  6, 'each column has a comment');

SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Events'
     AND column_name IN ('qbo_invoice_hash', 'qbo_invoice_sent_hash')),
  0, 'the two hash columns do not exist');

-- ═══ THE HASH MACHINERY IS AS IT WAS BEFORE THE MIGRATION ═══════════════════

SELECT is(
  (SELECT pg_get_functiondef('public.recompute_quote_hashes(uuid)'::regprocedure) LIKE '%qbo_invoice%'),
  false, 'recompute_quote_hashes() knows nothing about the invoice (no third document)');

SELECT is(
  (SELECT pg_get_functiondef('public.trg_recompute_quote_hashes_contacts()'::regprocedure)
          LIKE '%finance_contact_uuid%'),
  false, 'the Contacts trigger function still reads the plain contact only');

-- ═══ FIXTURE ════════════════════════════════════════════════════════════════

INSERT INTO public."EventTypes" (name) VALUES ('QIH City');
INSERT INTO public."Contacts" (first_name, last_name, email, phone)
VALUES ('Plain', 'Contact', 'plain@test.com', '111');
INSERT INTO public."Addresses" (street, city, state_province, zip_postal)
VALUES ('1 Main St', 'Austin', 'TX', '73301');

SELECT id AS type_a FROM public."EventTypes" WHERE name = 'QIH City' \gset
SELECT id AS contact_plain FROM public."Contacts" WHERE email = 'plain@test.com' \gset
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

SELECT is(
  (SELECT (qbo_invoice_id IS NULL AND qbo_invoice_connection_uuid IS NULL
           AND qbo_invoice_mismatch_reasons IS NULL AND qbo_invoice_checked_at IS NULL
           AND qbo_invoice_check_failed_at IS NULL AND qbo_invoice_mismatch = false)
   FROM public."Events" WHERE id = :'ev'),
  true, 'a new event has no invoice, reasons or check times, and the mismatch flag false');

CREATE TEMP TABLE before_hashes AS
  SELECT content_hash, contract_hash FROM public."Events" WHERE id = :'ev';

-- ═══ THE SERVER-WRITTEN COLUMNS ═════════════════════════════════════════════
-- Written as the table owner (the service role is not 'authenticated' either): no hash change,
-- no error from trigger recursion.

INSERT INTO public."QboConnections" (display_name, encrypted_token_value)
VALUES ('QIH Conn', 'x') RETURNING id AS conn \gset

SELECT lives_ok(
  format($q$UPDATE public."Events" SET qbo_invoice_id = '42', qbo_invoice_connection_uuid = %L,
            qbo_invoice_mismatch = true, qbo_invoice_mismatch_reasons = '["dates"]',
            qbo_invoice_checked_at = '2026-10-23 12:00:00+00',
            qbo_invoice_check_failed_at = '2026-10-23 12:05:00+00' WHERE id = %L$q$, :'conn', :'ev'),
  'the owner can write the six columns without a recursion error');
SELECT is(
  (SELECT (e.content_hash = h.content_hash AND e.contract_hash = h.contract_hash)
   FROM public."Events" e, before_hashes h WHERE e.id = :'ev'),
  true, '...and content_hash and contract_hash are unchanged by it');
SELECT is(
  (SELECT qbo_invoice_id || '/' || qbo_invoice_mismatch::text || '/' || qbo_invoice_mismatch_reasons
          || '/' || (qbo_invoice_checked_at AT TIME ZONE 'UTC')::text
          || '/' || (qbo_invoice_check_failed_at AT TIME ZONE 'UTC')::text
   FROM public."Events" WHERE id = :'ev'),
  '42/true/["dates"]/2026-10-23 12:00:00/2026-10-23 12:05:00', '...and the values are stored');

-- ═══ SIGNATURES ═════════════════════════════════════════════════════════════

INSERT INTO public."ContractSignatures" (event_uuid, terms_and_conditions_uuid, signer_name,
                                         status, signed_contract_hash)
SELECT :'ev', :'terms', 'Jordan Ellis', 'active', contract_hash FROM public."Events" WHERE id = :'ev';

UPDATE public."Events" SET qbo_invoice_mismatch = false, qbo_invoice_mismatch_reasons = NULL
WHERE id = :'ev';
SELECT is(
  (SELECT status FROM public."ContractSignatures" WHERE event_uuid = :'ev'),
  'active', 'a change to the invoice columns leaves the signature active');

-- Control: a change that moves contract_hash does invalidate, so the check above is not vacuous.
UPDATE public."EventLineItems" SET value_cents = 7000 WHERE id = :'line';
SELECT is(
  (SELECT status FROM public."ContractSignatures" WHERE event_uuid = :'ev'),
  'invalidated', '...whereas a price change invalidates it (control)');
UPDATE public."EventLineItems" SET value_cents = 5000 WHERE id = :'line';

UPDATE public."Events" SET qbo_invoice_mismatch = true, qbo_invoice_mismatch_reasons = '["dates"]'
WHERE id = :'ev';

-- ═══ THE ACCOUNTANT GUARD ═══════════════════════════════════════════════════

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('Qih', 'Acct', 'qih_acct@test.com', 'clerk_qih_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', 'clerk_qih_acct')::text, true);

SELECT throws_ok(
  format('UPDATE public."Events" SET qbo_invoice_id = ''99'' WHERE id = %L', :'ev'),
  '42501', NULL, 'an accountant cannot change qbo_invoice_id (refused by the guard)');
SELECT throws_ok(
  format('UPDATE public."Events" SET qbo_invoice_mismatch = false WHERE id = %L', :'ev'),
  '42501', NULL, 'an accountant cannot change qbo_invoice_mismatch');
SELECT throws_ok(
  format('UPDATE public."Events" SET qbo_invoice_mismatch_reasons = NULL WHERE id = %L', :'ev'),
  '42501', NULL, 'an accountant cannot change qbo_invoice_mismatch_reasons');
SELECT throws_ok(
  format('UPDATE public."Events" SET qbo_invoice_checked_at = now() WHERE id = %L', :'ev'),
  '42501', NULL, 'an accountant cannot change qbo_invoice_checked_at');
SELECT throws_ok(
  format('UPDATE public."Events" SET qbo_invoice_check_failed_at = now() WHERE id = %L', :'ev'),
  '42501', NULL, 'an accountant cannot change qbo_invoice_check_failed_at');

RESET ROLE;

SELECT is(
  (SELECT qbo_invoice_id || '/' || qbo_invoice_mismatch::text || '/' || qbo_invoice_mismatch_reasons
   FROM public."Events" WHERE id = :'ev'),
  '42/true/["dates"]', 'the row is read back unchanged after the refused attempts');

SELECT * FROM finish();
ROLLBACK;
