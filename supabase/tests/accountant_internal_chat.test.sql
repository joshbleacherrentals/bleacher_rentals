-- ============================================================================
-- Tests for the Accountant in the internal chat (EventMessages, EventSubscriptions,
-- EventMessageReadReceipts, EventTypingIndicators, EventMessageMentions)
-- Migration: 20261004180000_accountant_internal_chat.sql
-- Spec:      docs/specs/accountant-quotes-11-accountant-internal-chat.md (§5, §9.1)
-- ============================================================================
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/accountant_internal_chat.test.sql
--
-- Everything runs in a transaction that is ROLLED BACK at the end.
--
-- Written before the migration: it is the contract the migration is made to satisfy.
--
-- An accountant joins a chat (their own subscription only: D1), reads it, posts, marks read, shows
-- typing, mentions, edits their OWN messages and leaves (D2); they add and remove no one, delete no
-- message and no mention. Nobody else gains or loses anything.
--
-- A refusal looks different depending on the statement, and the test tells them apart:
--   * an INSERT the policy refuses RAISES 42501 — asserted with throws_ok;
--   * an UPDATE or DELETE the policy filters out matches no row and raises nothing — asserted as
--     "0 rows affected", and the row is read back afterwards (an update that was filtered out proves
--     nothing about the row on its own);
--   * a SELECT the policy filters out returns an empty result, not an error — so every read is its
--     own named assertion.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;
SET search_path TO extensions, public, "$user";
SELECT plan(67);

-- Rows affected by a statement, run as the current (RLS-bound) role. A refused write that raises
-- reports -1, so that one missing grant shows up as one red assertion and not as an aborted run.
CREATE FUNCTION public.test_rows(q text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE q;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;
END;
$$;

-- Become a signed-in app user, as PostgREST does: SET ROLE plus a jwt claim.
CREATE FUNCTION public.test_as(p_sub text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_sub)::text, true);
END;
$$;

-- ── Fixtures ────────────────────────────────────────────────────────────────

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'Admin', 'ic_admin@test.com', 'clerk_ic_admin', true, false)
RETURNING id AS user_admin \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'AM', 'ic_am@test.com', 'clerk_ic_am', false, false)
RETURNING id AS user_am \gset
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_am', true);

-- An accountant and nothing else.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'Acct', 'ic_acct@test.com', 'clerk_ic_acct', false, false)
RETURNING id AS user_acct \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_acct', true);

-- An accountant who is also an account manager (roles are additive).
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'Both', 'ic_both@test.com', 'clerk_ic_both', false, false)
RETURNING id AS user_both \gset
INSERT INTO public."Accountants" (user_uuid, is_active) VALUES (:'user_both', true);
INSERT INTO public."AccountManagers" (user_uuid, is_active) VALUES (:'user_both', true);

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'Viewer', 'ic_viewer@test.com', 'clerk_ic_viewer', false, true)
RETURNING id AS user_viewer \gset

INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'Maintainer', 'ic_maint@test.com', 'clerk_ic_maint', false, false)
RETURNING id AS user_maint \gset
INSERT INTO public."Maintainers" (user_uuid, is_active) VALUES (:'user_maint', true);

-- People with no role: the ones who are added to a chat and removed from it.
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'T1', 'ic_t1@test.com', 'clerk_ic_t1', false, false) RETURNING id AS user_t1 \gset
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'T2', 'ic_t2@test.com', 'clerk_ic_t2', false, false) RETURNING id AS user_t2 \gset
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'T3', 'ic_t3@test.com', 'clerk_ic_t3', false, false) RETURNING id AS user_t3 \gset
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'T4', 'ic_t4@test.com', 'clerk_ic_t4', false, false) RETURNING id AS user_t4 \gset
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'A1', 'ic_a1@test.com', 'clerk_ic_a1', false, false) RETURNING id AS user_a1 \gset
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'A2', 'ic_a2@test.com', 'clerk_ic_a2', false, false) RETURNING id AS user_a2 \gset
INSERT INTO public."Users" (first_name, last_name, email, clerk_user_id, is_admin, is_viewer)
VALUES ('IC', 'A3', 'ic_a3@test.com', 'clerk_ic_a3', false, false) RETURNING id AS user_a3 \gset

-- Two events. No owner, so the owner auto-subscribe trigger puts nobody in a chat on its own.
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, tax_percent, tax_amount_cents)
VALUES (gen_random_uuid(), 'InternalChat event A', '2026-07-01', '2026-07-02', false, false,
        'booked', 0, 0)
RETURNING id AS event_a \gset
INSERT INTO public."Events" (id, event_name, event_start, event_end, lenient, must_be_clean,
                             event_status, tax_percent, tax_amount_cents)
VALUES (gen_random_uuid(), 'InternalChat event B', '2026-07-01', '2026-07-02', false, false,
        'booked', 0, 0)
RETURNING id AS event_b \gset

-- Chat members. On event A: an account manager, an admin, the account manager + accountant, and
-- four people to be removed. On event B: one person, and no one of the people under test.
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_a', :'user_am');
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_a', :'user_admin');
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_a', :'user_both');
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_a', :'user_t1');
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_a', :'user_t2');
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_a', :'user_t3');
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_a', :'user_t4');
INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (:'event_b', :'user_t1');

-- Messages, one per purpose, so that a refusal on one never disturbs another.
INSERT INTO public."EventMessages" (event_uuid, user_uuid, body)
VALUES (:'event_a', :'user_am', 'by the account manager, the accountant tries to edit it')
RETURNING id AS m_am \gset
INSERT INTO public."EventMessages" (event_uuid, user_uuid, body)
VALUES (:'event_a', :'user_am', 'by the account manager, the admin edits it')
RETURNING id AS m_am_admin \gset
INSERT INTO public."EventMessages" (event_uuid, user_uuid, body)
VALUES (:'event_a', :'user_am', 'by the account manager, the account manager edits it')
RETURNING id AS m_am_own \gset
INSERT INTO public."EventMessages" (event_uuid, user_uuid, body)
VALUES (:'event_a', :'user_admin', 'by the admin, the account manager tries to edit it')
RETURNING id AS m_admin \gset

INSERT INTO public."EventMessageReadReceipts" (message_id, user_uuid) VALUES (:'m_am', :'user_admin');
INSERT INTO public."EventTypingIndicators" (event_uuid, user_uuid, is_typing)
VALUES (:'event_a', :'user_am', false);
INSERT INTO public."EventMessageMentions" (message_id, mentioned_user_uuid)
VALUES (:'m_am', :'user_admin')
RETURNING id AS mention_fixture \gset

SELECT gen_random_uuid() AS m_acct \gset

SELECT to_jsonb(m)::text AS snap_m_am FROM public."EventMessages" m WHERE m.id = :'m_am' \gset
SELECT to_jsonb(m)::text AS snap_m_admin FROM public."EventMessages" m WHERE m.id = :'m_admin' \gset

-- ═══ THE ACCOUNTANT READS (one assertion per table: a refused read is an empty result) ═══════════

SELECT public.test_as('clerk_ic_acct');

SELECT is((SELECT count(*)::int FROM public."EventMessages" WHERE id = :'m_am'), 1,
  'an accountant can read EventMessages');
SELECT is((SELECT count(*)::int FROM public."EventMessageReadReceipts" WHERE message_id = :'m_am'), 1,
  'an accountant can read EventMessageReadReceipts');
SELECT is((SELECT count(*)::int FROM public."EventTypingIndicators" WHERE user_uuid = :'user_am'), 1,
  'an accountant can read EventTypingIndicators');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_a' AND user_uuid = :'user_am'), 1,
  'an accountant can read EventSubscriptions');
SELECT is((SELECT count(*)::int FROM public."EventMessageMentions" WHERE id = :'mention_fixture'), 1,
  'an accountant can read EventMessageMentions');

-- ═══ THE ACCOUNTANT JOINS: themselves, and no one else (D1) ══════════════════════════════════════

SELECT is(
  public.test_rows(format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_acct')),
  1, 'an accountant subscribes themselves');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_a' AND user_uuid = :'user_acct'), 1,
  '...and the subscription exists');

SELECT throws_ok(
  format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_viewer'),
  '42501', NULL, 'an accountant cannot subscribe another user');
SELECT throws_ok(
  format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_b', :'user_am'),
  '42501', NULL, 'an accountant cannot subscribe an account manager either');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_a' AND user_uuid = :'user_viewer')
        + (SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_b' AND user_uuid = :'user_am'), 0,
  '...and neither of those subscriptions exists');

-- ═══ THE ACCOUNTANT POSTS, MARKS READ, SHOWS TYPING AND MENTIONS ═════════════════════════════════

SELECT is(
  public.test_rows(format('INSERT INTO public."EventMessages" (id, event_uuid, user_uuid, body) VALUES (%L, %L, %L, %L)', :'m_acct', :'event_a', :'user_acct', 'hello from the accountant')),
  1, 'an accountant inserts a message');
SELECT is((SELECT body FROM public."EventMessages" WHERE id = :'m_acct'), 'hello from the accountant',
  '...and the message exists');

SELECT is(
  public.test_rows(format('INSERT INTO public."EventMessageReadReceipts" (message_id, user_uuid) VALUES (%L, %L)', :'m_am', :'user_acct')),
  1, 'an accountant inserts a read receipt');
SELECT is((SELECT count(*)::int FROM public."EventMessageReadReceipts" WHERE message_id = :'m_am' AND user_uuid = :'user_acct'), 1,
  '...and the read receipt exists');

SELECT is(
  public.test_rows(format('INSERT INTO public."EventTypingIndicators" (event_uuid, user_uuid, is_typing) VALUES (%L, %L, false)', :'event_a', :'user_acct')),
  1, 'an accountant inserts a typing indicator');
SELECT is(
  public.test_rows(format('UPDATE public."EventTypingIndicators" SET is_typing = true WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_acct')),
  1, 'an accountant updates their own typing indicator');
SELECT is((SELECT is_typing FROM public."EventTypingIndicators" WHERE event_uuid = :'event_a' AND user_uuid = :'user_acct'), true,
  '...and it really changed');
SELECT is(
  public.test_rows(format('UPDATE public."EventTypingIndicators" SET is_typing = true WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_am')),
  0, 'an accountant cannot update someone else''s typing indicator');
SELECT is((SELECT is_typing FROM public."EventTypingIndicators" WHERE event_uuid = :'event_a' AND user_uuid = :'user_am'), false,
  '...and it is unchanged');

SELECT is(
  public.test_rows(format('INSERT INTO public."EventMessageMentions" (message_id, mentioned_user_uuid) VALUES (%L, %L)', :'m_acct', :'user_admin')),
  1, 'an accountant inserts a mention');
SELECT is((SELECT count(*)::int FROM public."EventMessageMentions" WHERE message_id = :'m_acct'), 1,
  '...and the mention exists');

-- ═══ THE ACCOUNTANT EDITS ONLY THEIR OWN MESSAGES ════════════════════════════════════════════════

SELECT is(
  public.test_rows(format('UPDATE public."EventMessages" SET body = %L, edited_at = now() WHERE id = %L', 'edited by the accountant', :'m_acct')),
  1, 'an accountant updates their own message');
SELECT is((SELECT body FROM public."EventMessages" WHERE id = :'m_acct'), 'edited by the accountant',
  '...and the message really changed');

SELECT is(
  public.test_rows(format('UPDATE public."EventMessages" SET body = %L WHERE id = %L', 'hacked', :'m_am')),
  0, 'an accountant cannot update an account manager''s message');
SELECT is((SELECT to_jsonb(m)::text FROM public."EventMessages" m WHERE m.id = :'m_am'), :'snap_m_am',
  '...and it is unchanged');
SELECT is(
  public.test_rows(format('UPDATE public."EventMessages" SET body = %L WHERE id = %L', 'hacked', :'m_admin')),
  0, 'an accountant cannot update an admin''s message');
SELECT is((SELECT to_jsonb(m)::text FROM public."EventMessages" m WHERE m.id = :'m_admin'), :'snap_m_admin',
  '...and it is unchanged');

-- ═══ THE ACCOUNTANT DELETES NO MESSAGE AND NO MENTION ════════════════════════════════════════════

SELECT count(*) AS n_messages FROM public."EventMessages" \gset
SELECT count(*) AS n_mentions FROM public."EventMessageMentions" \gset

SELECT is(public.test_rows('DELETE FROM public."EventMessages"'), 0,
  'an accountant deletes no message, their own included');
SELECT is((SELECT count(*)::int FROM public."EventMessages"), :n_messages::int,
  '...and every message is still there');
SELECT is(public.test_rows('DELETE FROM public."EventMessageMentions"'), 0,
  'an accountant deletes no mention');
SELECT is((SELECT count(*)::int FROM public."EventMessageMentions"), :n_mentions::int,
  '...and every mention is still there');

-- ═══ THE ACCOUNTANT'S SUBSCRIPTION: the unread flag, no one else's, leaving, joining again ═══════

SELECT is(
  public.test_rows(format('UPDATE public."EventSubscriptions" SET unread = true WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_acct')),
  1, 'an accountant sets the unread flag of their own subscription');
SELECT is(
  public.test_rows(format('UPDATE public."EventSubscriptions" SET unread = true WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_admin')),
  0, 'an accountant cannot set the unread flag of someone else''s subscription');
SELECT is((SELECT unread FROM public."EventSubscriptions" WHERE event_uuid = :'event_a' AND user_uuid = :'user_admin'), false,
  '...and it is unchanged');

SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_t3')),
  0, 'an accountant cannot delete another user''s subscription, though they are a member of the chat');
SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_admin')),
  0, 'an accountant cannot delete an admin''s subscription');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_a' AND user_uuid IN (:'user_t3', :'user_admin')), 2,
  '...and both subscriptions are still there');

SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_acct')),
  1, 'an accountant deletes their own subscription (leaves the chat, D2)');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_a' AND user_uuid = :'user_acct'), 0,
  '...and it is gone');
SELECT is(
  public.test_rows(format('INSERT INTO public."EventMessages" (event_uuid, user_uuid, body, is_system) VALUES (%L, %L, %L, true)', :'event_a', :'user_acct', 'IC Acct left the chat.')),
  1, 'an accountant posts the system message "left the chat"');
SELECT is(
  public.test_rows(format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_acct')),
  1, 'an accountant joins again after leaving');

-- ═══ AN ADMIN BEHAVES AS BEFORE: adds and removes others, edits any message ══════════════════════

SELECT public.test_as('clerk_ic_admin');

SELECT is(
  public.test_rows(format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_a1')),
  1, 'an admin adds another user to a chat');
SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_t2')),
  1, 'an admin removes another user from a chat');
SELECT is(
  public.test_rows(format('UPDATE public."EventMessages" SET body = %L WHERE id = %L', 'edited by the admin', :'m_am_admin')),
  1, 'an admin edits another user''s message');
SELECT is((SELECT body FROM public."EventMessages" WHERE id = :'m_am_admin'), 'edited by the admin',
  '...and it really changed');

-- ═══ AN ACCOUNT MANAGER BEHAVES AS BEFORE ════════════════════════════════════════════════════════

SELECT public.test_as('clerk_ic_am');

SELECT is(
  public.test_rows(format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_a2')),
  1, 'a subscribed account manager adds another user to a chat');
SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_t1')),
  1, 'a subscribed account manager removes another user from a chat');
SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_b', :'user_t1')),
  0, 'an account manager who is not in the chat removes no one from it');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_b' AND user_uuid = :'user_t1'), 1,
  '...and that subscription is still there');
SELECT is(
  public.test_rows(format('UPDATE public."EventMessages" SET body = %L WHERE id = %L', 'edited by its author', :'m_am_own')),
  1, 'an account manager edits their own message');
SELECT is(
  public.test_rows(format('UPDATE public."EventMessages" SET body = %L WHERE id = %L', 'hacked', :'m_admin')),
  0, 'an account manager cannot edit an admin''s message');
SELECT is((SELECT to_jsonb(m)::text FROM public."EventMessages" m WHERE m.id = :'m_admin'), :'snap_m_admin',
  '...and it is unchanged');

-- ═══ AN ACCOUNTANT WHO IS ALSO AN ACCOUNT MANAGER: roles are additive ════════════════════════════

SELECT public.test_as('clerk_ic_both');

SELECT is(
  public.test_rows(format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_a3')),
  1, 'an accountant who is also an account manager adds another user to a chat');
SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_t4')),
  1, 'an accountant who is also a subscribed account manager removes another user from a chat');
SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_b', :'user_t1')),
  0, 'an accountant who is also an account manager, but not in the chat, removes no one from it');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_b' AND user_uuid = :'user_t1'), 1,
  '...and that subscription is still there');

-- ═══ A VIEWER STILL READS AND WRITES NOTHING ═════════════════════════════════════════════════════

SELECT public.test_as('clerk_ic_viewer');

SELECT is((SELECT count(*)::int FROM public."EventMessages" WHERE id = :'m_am'), 1,
  'a viewer still reads EventMessages');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions" WHERE event_uuid = :'event_a' AND user_uuid = :'user_am'), 1,
  'a viewer still reads EventSubscriptions');
SELECT throws_ok(
  format('INSERT INTO public."EventMessages" (event_uuid, user_uuid, body) VALUES (%L, %L, %L)', :'event_a', :'user_viewer', 'viewer'),
  '42501', NULL, 'a viewer still cannot post');
SELECT throws_ok(
  format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_viewer'),
  '42501', NULL, 'a viewer still cannot subscribe');
SELECT is(
  public.test_rows(format('UPDATE public."EventMessages" SET body = %L WHERE id = %L', 'hacked', :'m_am')),
  0, 'a viewer still cannot edit a message');
SELECT is(
  public.test_rows(format('DELETE FROM public."EventSubscriptions" WHERE event_uuid = %L AND user_uuid = %L', :'event_a', :'user_t3')),
  0, 'a viewer still cannot remove anyone');

-- ═══ A MAINTAINER STILL CANNOT READ OR WRITE ═════════════════════════════════════════════════════

SELECT public.test_as('clerk_ic_maint');

SELECT is((SELECT count(*)::int FROM public."EventMessages"), 0,
  'a maintainer still reads no message');
SELECT is((SELECT count(*)::int FROM public."EventSubscriptions"), 0,
  'a maintainer still reads no subscription');
SELECT throws_ok(
  format('INSERT INTO public."EventMessages" (event_uuid, user_uuid, body) VALUES (%L, %L, %L)', :'event_a', :'user_maint', 'maintainer'),
  '42501', NULL, 'a maintainer still cannot post');
SELECT throws_ok(
  format('INSERT INTO public."EventSubscriptions" (event_uuid, user_uuid) VALUES (%L, %L)', :'event_a', :'user_maint'),
  '42501', NULL, 'a maintainer still cannot subscribe');

RESET ROLE;

-- Nothing the refusals above guarded was touched.
SELECT is((SELECT to_jsonb(m)::text FROM public."EventMessages" m WHERE m.id = :'m_admin'), :'snap_m_admin',
  'the admin''s message survived every attempt on it');

SELECT * FROM finish();

ROLLBACK;
