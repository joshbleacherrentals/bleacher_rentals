# Accountant — the internal chat

Status: **IMPLEMENTED 2026-10-06, awaiting review** — not checked by hand in a browser (Clerk sign-in is unavailable
here); Playwright specs written, not run; the `br_powersync` sync-rules diff is uncommitted and not deployed. 0 open decisions (D1–D4 answered 2026-10-03; the behaviour
of §0 comes from the request, with two readings to confirm, marked in §0). Approved 2026-10-06 with three answers:
`canJoin` / `canLeave` are not returned by the hook (1 C, §4), the four places get the capabilities through a new hook
`useInternalChatCapabilities` (2 B, §4 and §8), and the tests that pin the old behaviour are rewritten first and added
to §8 (the tests were written before this approval, at the user's request).
Original request: №8. Implementation order: **11 of 11**. Needs
[03](accountant-quotes-03-capabilities.md) (the capability system) and
[04](accountant-quotes-04-accountant-quote-access.md) (the accountant opens the card, so its Messages tab).
Branch: `q4-sprint1-finance-role`.
Builds on: [accountant-role.md](accountant-role.md). Sync rules live in the separate repo `br_powersync`
(`config/sync_rules.yaml`).

## 0. The request, and what it is not

The accountant uses the **internal chat** of quotes, bookings and events:

- **joins** a chat (the Join button), **reads** it, **posts** in the chats they have joined, **edits their own
  messages**, **mentions** other members and **is mentioned**, and **leaves** a chat (D2);
- **cannot add other users to a chat and cannot remove anyone from it** (D1);
- opens **`/messages/internal`** (the conversation list and a chat) and the **Messages tab** of a quote;
- sees the chat's notification bell in the header.

Two readings of the request, **to confirm at review**: "edit" means **their own messages** only (an account manager
can edit only their own, an admin any); "join" means **any event's chat**, as for an account manager.

**Not part of this spec, so not changed:**

- `/messages/external` is not given to the accountant on purpose, but it stays reachable by URL (D4): the page is a
  placeholder with one heading;
- deleting messages (the screen has no such control; an account manager's delete policy is untouched and the
  accountant gets none);
- what an admin, account manager or viewer can do in the chat — **behaviour for them is unchanged**.

## 1. Decisions (all taken by the user)

**D1 — adding others to a chat**

- **Option A — the accountant can add other users** (an Add button for any admin, account manager or accountant who
  is not yet a member); no Remove. **Option B — only themselves:** the accountant can join, and cannot add anyone else.
- **User's answer: B — only themselves.** So the accountant has no members modal at all: neither add-others nor
  remove.

**D2 — leaving a chat**

- **Option A — the accountant can leave** (as every role today: the row is removed, a system message "… left the
  chat." is posted). **Option B — cannot leave.**
- **User's answer: A — can leave.**

**D3 — how the chat code asks "may I?"**

- **Option A — chat capabilities:** one function in the system of spec 03, read by the four places that ask today.
  **Option B — one more role check** added in each of those places.
- **User's answer: A — chat capabilities.**

**D4 — `/messages/external`**

- **Option A — leave it reachable** (the path prefix `/messages` opens it; the page is a placeholder). **Option B —
  redirect a role without the capability to `/messages/internal`.**
- **User's answer: A — leave it reachable.** The sidebar's External entry is hidden for the accountant either way.

## 2. Research findings

**Where the chat asks about roles today — four places, all by `isAdmin` / `isAccountManager` flags:**

- `components/Header.tsx`: `showChatNotifications = isAdmin || isAccountManager` — the bell;
- `app/messages/internal/layout.tsx`: `canUseInternalChat = isAdmin || isAccountManager`, else "Internal chat is
  available to admins and account managers only.";
- `features/eventChat/hooks/useEventChatMemberAccess.ts`: `canManageMembers = isAdmin || (isAccountManager &&
isSubscribed)` and `canWrite = isAdmin || isSubscribed`;
- `features/eventChat/components/InternalMessagesSidebar.tsx`: `canManageMembers = isAdmin || isAccountManager` (for the
  conversation menu). The sidebar lists only conversations the user is subscribed to, so there it equals the hook's
  rule.
- The card's `MessagesTab` already reads `can.useInternalChat` (spec 03).

**Who can be a member or be mentioned.** `useChatEligibleUsers` selects active users who are an admin or have an
`AccountManagers` row; `useMentionableChatMembers` takes the subscribed ones. An accountant is neither, so they would
not appear in the members list or the mention picker. `AccountManagers` and `Accountants` rows reach every active web
user through the identity query, so no new table is needed to learn who is an accountant.

**The tables the chat reads:** `EventSubscriptions`, `EventMessages`, `EventMessageReadReceipts`,
`EventTypingIndicators`, `EventMessageMentions`, plus `Events` and `Users`. The accountant's device has `Events` and
`Users` (specs 02 and Stage 2); **none of the five chat tables.**

**RLS today** (`20260604110000_send_quotes.sql`, `20260707120000_event_message_mentions.sql`,
`20260702120000_event_subscriptions_user_uuid.sql`, `20260710180000_event_subscriptions_unread.sql`):

- `EventMessages`: select `{admin,account_manager,viewer}`; insert `{admin,account_manager}`; update — an admin, or an
  account manager on their **own** row; delete — an admin, or an account manager on their own row;
- `EventMessageReadReceipts`: select `{admin,account_manager,viewer}`; insert `{admin,account_manager}`;
- `EventTypingIndicators`: select `{admin,account_manager,viewer}`; insert and update `{admin,account_manager}` on the
  user's own row;
- `EventSubscriptions`: select `{admin,account_manager,viewer}`; insert `{admin,account_manager}` with **no**
  restriction on whose row; update — an admin or the row's own user (**any role**); delete — an admin, **the row's own
  user (any role)**, or a subscribed account manager;
- `EventMessageMentions`: select `{admin,account_manager,viewer}`; insert `{admin,account_manager}`; delete admin only.

**The sidebar and the path.** The `messages` item has two children, Internal and External, with no per-child roles; the
accountant's path list has no `/messages`. The prefix `/messages` would open `/messages/external` too (D4).

**What the app writes in the chat:** `EventMessages` (insert, update — an edit, and a system "left the chat" message),
`EventSubscriptions` (insert on join, delete on leave, update of the unread flag), `EventMessageReadReceipts`,
`EventTypingIndicators`, `EventMessageMentions` (insert; on an edit all mentions of the message are deleted and
re-inserted).

## 3. The chat capabilities (D3)

New: `src/features/userAccess/logic/getInternalChatCapabilities.ts`, pure. Input: the user's `roles` and, for one
event's chat, whether the user is subscribed. Roles are additive.

- **`useInternalChat`** — opens the chat pages and the Messages tab: admin, account manager, **accountant**.
- **`postInChat`** — posts and edits their own messages, marks read, shows typing: admin always; account manager and
  **accountant only when subscribed**.
- **`joinChat`** — the Join button: admin, account manager, **accountant**.
- **`leaveChat`** — Leave chat: admin, account manager, **accountant**, when subscribed.
- **`manageChatMembers`** — add others and remove others, together: admin always; account manager when subscribed;
  **the accountant never** (D1).
- any other role: all "no".

`getQuotesBookingsCapabilities.useInternalChat` (spec 03) **delegates** to this function, so the rule lives in one
place. For an admin and an account manager every result equals today's (the hook's formulas above); for the
accountant `useInternalChat`, `joinChat`, `leaveChat` and `postInChat` (when subscribed) are "yes" and
`manageChatMembers` is "no".

## 4. What changes in the app

- **The hook (2 B)** — `src/features/eventChat/hooks/useInternalChatCapabilities.ts`, new: the one place of the chat
  that reads the store's `roles` and calls `getInternalChatCapabilities`; it takes `isSubscribed` (false by default).
- The four places of §2 read the capabilities through it instead of flags: `Header.tsx` (the bell: `useInternalChat`),
  `app/messages/internal/layout.tsx` (`useInternalChat`), `useEventChatMemberAccess.ts` (returns `isSubscribed`,
  `canWrite = postInChat` and `canManageMembers = manageChatMembers` — **not** `canJoin` / `canLeave`, 1 C: the Join
  button and the Leave item depend on being subscribed, not on the role, so nothing would read them),
  `InternalMessagesSidebar.tsx` (`manageChatMembers`, for a conversation the user is subscribed to). `joinChat` and
  `leaveChat` stay in the function of §3, which the tests pin. No chat component reads `isAdmin`, `isAccountManager`
  or `roles` any more; only the hook reads `roles`.
- The message shown to a role without the chat (the layout and `MessagesTab`) becomes "Internal chat is available
  to admins, account managers and accountants only."
- `useChatEligibleUsers.ts`: an active user is eligible when they are an admin, an account manager **or an
  accountant** (an active `Accountants` row), so an accountant appears in the mention picker for others and can be
  added by an admin or an account manager.
- **Access and sidebar:** `accessConfig.ts` — the accountant's list gains `/messages`, after `/work-trackers`
  (`/accountant` stays first, so it stays the landing page). `useSidebarItems.ts` — the accountant gets the `messages`
  item with **Internal** only: the External child gets a `roles` list that does not include the accountant.
- `permissionPageData.ts` (draft wording, for review) — **Event Chat:** accountant `none` → `custom`: "Can read
  every event chat, join any of them and leave, and post in the ones they have joined. Can edit only their own
  messages, mention other members and be mentioned. Cannot add anyone else to a chat or remove anyone from one."
  The role description gains "and the internal chat". `permissionPageData.test.ts` is updated.

## 5. Database — `supabase/migrations/20261004180000_accountant_internal_chat.sql`

(After spec 10's `20261004170000`; renumber if `develop` has moved.) Every statement adds `accountant` to an **existing**
policy with `ALTER POLICY`, keeping the rest:

- `EventMessages`: `event_messages_select`, `event_messages_insert` — `accountant` added to the role list;
  `event_messages_update` — the account manager's "own row" clause becomes `{account_manager,accountant}`, so the
  accountant edits **only their own messages**.
- `EventMessageReadReceipts`: `…_select` and `…_insert` — `accountant` added.
- `EventTypingIndicators`: `…_select`, `…_insert`, `…_update` — `accountant` added (the update stays on the user's own
  row).
- `EventSubscriptions`: `event_subscriptions_select` — `accountant` added; `event_subscriptions_insert` — `WITH CHECK
(roles && '{admin,account_manager}' OR (roles && '{accountant}' AND user_uuid = public.get_current_user_uuid()))`,
  so the accountant can add **only themselves** (D1).
- `EventMessageMentions`: `…_select`, `…_insert` — `accountant` added.

**Deliberately not changed:** every DELETE policy (an accountant cannot delete a message, a mention or another user's
subscription; the existing "the row's own user" clause already lets them delete **their own** subscription, which is
leaving, D2); the unread-flag UPDATE (already "own row, any role"); `EventMessageMentions` delete (admin only);
`is_subscribed_to_event`; the triggers.

## 6. Sync rules — `br_powersync/config/sync_rules.yaml` (separate PR; not counted)

In the accountant block add whole-table queries in the shape of specs 02 and 04, as for account managers:
`EventMessages`, `EventSubscriptions`, `EventMessageReadReceipts`, `EventTypingIndicators`, `EventMessageMentions`.
Compare the parameterised bucket count before and after (it must not grow; spec 02 §6). The accountant's client now writes
chat rows: the block's comment about writing nothing is updated (spec 10 §4 already asks for it). **The PowerSync service
must be restarted.** Deployment order: migration → sync rules and restart → app.

## 7. Behaviour scenarios (for Playwright — written, not run)

- **S1** accountant's sidebar: **Messages** with **Internal** only; the bell is in the header.
- **S2** accountant on a quote, Messages tab: the Join button; after joining they post, edit their own message (not
  anyone else's) and see the others' messages.
- **S3** accountant mentions an admin in a message: the admin gets the notification. An admin mentions the accountant:
  the accountant appears in the picker and gets the notification and the bell.
- **S4** the accountant has no members modal: no Add, no Remove. An admin or an account manager can add the accountant
  to a chat.
- **S5** accountant presses Leave chat: the conversation leaves their list and the chat shows "… left the chat."; they can
  join again.
- **S6** `/messages/internal`: the conversation list and a chat open; `/messages/external` opens the placeholder (D4).
- **S7** account manager, admin, viewer: unchanged.
- The refusals (adding another user, deleting a message, editing another's message) are asserted in the SQL test.

## 8. Files

**Counted — 13 files** (over the limit of 10; one logic is not split across specs; the 13th is the hook of 2 B):

1. `src/features/userAccess/logic/getInternalChatCapabilities.ts` — new
2. `src/features/userAccess/logic/getQuotesBookingsCapabilities.ts` — changed: delegates `useInternalChat`
3. `src/features/eventChat/hooks/useEventChatMemberAccess.ts` — changed
4. `src/features/eventChat/components/InternalMessagesSidebar.tsx` — changed
5. `src/app/messages/internal/layout.tsx` — changed
6. `src/components/Header.tsx` — changed
7. `src/features/eventChat/hooks/useChatEligibleUsers.ts` — changed
8. `src/features/userAccess/accessConfig.ts` — changed
9. `src/components/sidebar/useSidebarItems.ts` — changed
10. `src/features/quotesAndBookings/components/quoteDetail/tabs/MessagesTab.tsx` — changed: the message text
11. `supabase/migrations/20261004180000_accountant_internal_chat.sql` — new
12. `package.json` — changed: `test:db:accountantchat`, added to `test:db:all`
13. `src/features/eventChat/hooks/useInternalChatCapabilities.ts` — new (2 B)

**Not counted:** `br_powersync/config/sync_rules.yaml`; `src/features/userAccess/permissionPageData.ts`; tests —
`supabase/tests/accountant_internal_chat.test.sql` and `getInternalChatCapabilities.test.ts` (new);
`getQuotesBookingsCapabilities.test.ts`, `accessConfig.test.ts`, `useSidebarItems.test.ts`,
`permissionPageData.test.ts`, `roleAccess.accountant.spec.ts` (edited); the Playwright specs of §7.

**Added 2026-10-06 (tests that pin the old behaviour, rewritten first):** `MessagesTab.test.tsx` (the message text);
the e2e `accountantQuoteCard.accountant.spec.ts` (S4: the chat, not the text), `quoteCapabilities.viewer.spec.ts` (S5:
the new text) and `quoteCapabilities.admin.spec.ts` (S1: the new text is absent); the new e2e
`src/features/eventChat/e2e/accountantChat.accountant.spec.ts` (S1–S6) and `internalChat.am.spec.ts` (S7). In
`permissionPageData.test.ts` the "hidden-from-you note" check takes _Companies & Contacts_ instead of _Event Chat_.

## 9. Tests and implementation sequence

Red first; each step ends at a gate. Playwright is **written, not run** (the project needs `E2E_ACCOUNTANT_EMAIL`);
Prettier only on touched files.

**9.1 Database** — `supabase/tests/accountant_internal_chat.test.sql`, `npm run test:db:accountantchat`; dry-run in
`BEGIN … ROLLBACK` through the `supabase_db_bleacher_rentals` container. **One named assertion each** (a refused read is
an empty result, not an error; every refusal reads the row back):

- an accountant-only user **reads** messages, read receipts, typing indicators, subscriptions and mentions;
- **inserts** a message, a read receipt, a typing indicator and a mention; **updates** their typing indicator and
  **their own** message; **cannot update another user's message**; **cannot delete any message or mention**;
- **subscribes themselves**; **cannot subscribe another user**; **deletes their own subscription** (leaves); **cannot
  delete another user's subscription**;
- an admin and an account manager behave exactly as before (add others, remove others as the policies allow, edit rules);
  a viewer still reads and cannot write; a maintainer cannot read;
- the other roles' reads and writes are unchanged (`rls_multi_role.test.sql` stays green).

**9.2 Capabilities** — `getInternalChatCapabilities.test.ts` first: the whole table by role and subscription (admin
subscribed and not; account manager subscribed and not; accountant subscribed and not; viewer, maintainer, developer,
driver); combinations (accountant + account manager gets the account manager's `manageChatMembers` when subscribed).
`getQuotesBookingsCapabilities.test.ts`: `useInternalChat` is true for the accountant. Then the function and the four
places; `accessConfig.test.ts` (the accountant has `/messages`; AM and viewer unchanged), `useSidebarItems.test.ts` (the
accountant: Messages → Internal only; the AM sees both), `permissionPageData.test.ts`.

**9.3 Gate:** `npm run tc`, `npx vitest run`, `test:db:*`, `prettier --check <touched files>`; E2E SKIPPED (not run
locally, by instruction).

## 10. Edge cases and error handling

- **Offline.** Messages, edits, joins and leaves are local writes that upload later; a refusal discards the transaction
  with the existing toast.
- **Leaving.** The accountant stays out of a chat until they join again, as for everyone, an owner included.
- **A role removed while signed in.** `get_user_roles()` and the store update; the bell and the pages disappear on the next
  render; a queued write is refused and discarded.
- **A user who is account manager and accountant.** Roles are additive: the account manager's `manageChatMembers` applies
  when they are subscribed.
- **Deactivated accountant.** RLS refuses, sync stops, the access layer shows "account deactivated" — unchanged.
- **Clerk.** Nothing new: no route, token or webhook is touched.

## 11. Risks, and found on the way

**Risks**

- **R1 — the accountant's device receives every chat.** Whole-table sync, as for account managers, brings the messages
  of all events, not only those the accountant has joined; reading is not gated by joining.
- **R2 — a member the accountant cannot remove.** A subscription is removable by an admin, by a subscribed account
  manager and by its owner; once in a chat the accountant stays there until they leave themselves or an admin removes them.
- **R3 — 12 counted files.** A large diff to review in one commit.

**Found on the way — reported, not fixed**

1. **An edit cannot remove a mention for anyone but an admin.** `replaceEventMessageMentions` deletes the message's
   mentions and re-inserts them, but `EventMessageMentions` delete is admin-only and a refused delete is a silent no-op —
   the old mentions stay. The same holds for account managers today and for the accountant after this spec.
2. **The matrix says a viewer can read event chats; the screens block a viewer** (the Messages tab and `/messages/internal`
   show "available to admins and account managers only").
3. **`event_messages_insert` and `event_subscriptions_insert` do not pin `user_uuid` to the caller** for admins and account
   managers: a message or a subscription can be written in someone else's name.
4. **`EventMessageMentions` is in no sync stream of `br_powersync/config/sync_rules.yaml` except the accountant's one added
   here** (found at implementation, 2026-10-06): the admin, account manager and viewer streams carry `EventMessages`,
   `EventSubscriptions`, `EventMessageReadReceipts` and `EventTypingIndicators`, but not the mentions. §6 says "as for
   account managers", which does not hold for this table in the repository's file. Until it is added for them (or the
   deployed file differs from the repository's), a mention reaches the accountant's device but not an admin's or an
   account manager's — so S3's "the admin gets the notification" would not happen. Not changed: out of scope.
