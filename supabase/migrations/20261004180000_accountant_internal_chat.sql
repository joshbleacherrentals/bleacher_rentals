-- The Accountant uses the internal chat (docs/specs/accountant-quotes-11-accountant-internal-chat.md).
--
-- An accountant joins a chat (their own subscription only), reads it, posts, marks read, shows
-- typing, mentions, edits their OWN messages and leaves; they add and remove no one, delete no
-- message and no mention. Every statement adds `accountant` to an EXISTING policy with ALTER POLICY
-- and keeps the rest of it:
--
--   EventMessages            select, insert: + accountant. update: the account manager's "own row"
--                            clause becomes {account_manager, accountant}, so an accountant edits
--                            only their own messages (an admin still edits any).
--   EventMessageReadReceipts select, insert: + accountant.
--   EventTypingIndicators    select, insert, update: + accountant (the update stays on the user's own
--                            row).
--   EventSubscriptions       select: + accountant. insert: an admin or an account manager adds anyone
--                            (as before); an accountant adds only themselves (user_uuid = the caller),
--                            so they can join and cannot add another user.
--   EventMessageMentions     select, insert: + accountant.
--
-- Deliberately not changed:
--   * every DELETE policy. An accountant cannot delete a message, a mention or another user's
--     subscription. The existing "the row's own user" clause of the EventSubscriptions delete policy
--     already lets them delete THEIR OWN subscription, which is leaving the chat.
--   * the unread-flag UPDATE of EventSubscriptions (already "own row, any role"), the
--     EventMessageMentions delete (admin only), is_subscribed_to_event and the triggers.
--
-- An accountant's offline write meets these policies when the upload queue drains; a refusal (42501)
-- discards the whole transaction with the connector's toast.
--
-- Deploy order: this migration → sync rules (br_powersync) and a PowerSync restart → the app. Without
-- the sync rules the chat tables never reach the accountant's device and the chat shows empty.

-- EventMessages
ALTER POLICY event_messages_select ON public."EventMessages"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY event_messages_insert ON public."EventMessages"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY event_messages_update ON public."EventMessages"
  USING (
    'admin'::text = ANY (public.get_user_roles())
    OR (
      public.get_user_roles() && '{account_manager,accountant}'::text[]
      AND user_uuid = public.get_current_user_uuid()
    )
  )
  WITH CHECK (
    'admin'::text = ANY (public.get_user_roles())
    OR (
      public.get_user_roles() && '{account_manager,accountant}'::text[]
      AND user_uuid = public.get_current_user_uuid()
    )
  );

-- EventMessageReadReceipts
ALTER POLICY event_message_read_receipts_select ON public."EventMessageReadReceipts"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY event_message_read_receipts_insert ON public."EventMessageReadReceipts"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

-- EventTypingIndicators
ALTER POLICY event_typing_indicators_select ON public."EventTypingIndicators"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY event_typing_indicators_insert ON public."EventTypingIndicators"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);

ALTER POLICY event_typing_indicators_update ON public."EventTypingIndicators"
  USING (
    public.get_user_roles() && '{admin,account_manager,accountant}'::text[]
    AND user_uuid = public.get_current_user_uuid()
  )
  WITH CHECK (
    public.get_user_roles() && '{admin,account_manager,accountant}'::text[]
    AND user_uuid = public.get_current_user_uuid()
  );

-- EventSubscriptions
ALTER POLICY event_subscriptions_select ON public."EventSubscriptions"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY event_subscriptions_insert ON public."EventSubscriptions"
  WITH CHECK (
    public.get_user_roles() && '{admin,account_manager}'::text[]
    OR (
      public.get_user_roles() && '{accountant}'::text[]
      AND user_uuid = public.get_current_user_uuid()
    )
  );

-- EventMessageMentions
ALTER POLICY event_message_mentions_select ON public."EventMessageMentions"
  USING (public.get_user_roles() && '{admin,account_manager,viewer,accountant}'::text[]);

ALTER POLICY event_message_mentions_insert ON public."EventMessageMentions"
  WITH CHECK (public.get_user_roles() && '{admin,account_manager,accountant}'::text[]);
