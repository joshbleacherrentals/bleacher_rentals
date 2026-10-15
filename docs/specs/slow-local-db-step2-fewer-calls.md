# Slow local database, step 2: fewer calls per chat action

Status: **IMPLEMENTED 2026-10-14, uncommitted, awaiting review** (approved the same day) —
0 open decisions (D1–D2 answered 2026-10-14). Step 2 of [slow-local-db-plan.md](slow-local-db-plan.md). All three parts
are built; the manual checks and the measurement are the user's. Request (user, 2026-10-14): fewer local database calls per user
action, for the chat actions "marked as read" and "chat member"; each flow its own commit.
Branch: as in the plan.

## 0. The request, and what it is not

**In scope:** two chat flows.

1. Marking a chat's messages as read (`markEventMessagesRead`).
2. Adding or removing a chat member (the members modal), and leaving a chat
   (`leaveEventChat`, the same shape as removing; see section 13).

**Not in scope (D1):** saving or creating a quote, the typing indicator, sending a message,
any other action, steps 3 and 4 of the plan.

## 1. Decisions taken

**D1 — which actions.** Options: read in chat; chat member; quote save and create; typing
indicator.
User's answer: **read in chat, and chat member.**

**D2 — how the read receipts are batched.** The server has `unique (message_id, user_uuid)`
on receipts and a role check on insert; the upload discards the rest of a transaction after a
failure of class 23 or 42501 (`BackendConnector`). Options: everything in one transaction;
receipts in one transaction and the unread reset separate; leave receipts out.
User's answer: **receipts in one transaction, the unread reset separate.** Consequence: two
transactions instead of 3 + 2N; a refused receipt discards only the rest of the receipts of
that run, and the unread reset still reaches the server.

## 2. What the code does today

- **`markEventMessagesRead`** (`db/readReceipts.ts`): one read of all message ids of the
  event, one read of the user's receipts among them, then for every message without a receipt
  one re-check read and one insert, then one update that clears the subscription's `unread`.
  That is 3 + 2N sequential calls for N unread messages, each insert its own transaction.
  It is called from 4 places in `EventInternalChat.tsx`; an in-flight guard per
  (event, user) stops overlapping runs.
- **Add a member** (`EventChatMembersModal`): `subscribeToEvent` (a read, then an insert unless
  the subscription exists), then `sendEventMessage` for the system message "X added Y to the
  conversation." (an insert): 3 calls, 3 transactions. **Remove** is a delete and the same
  insert. **Leave** (`leaveEventChat`) is a delete and an insert.
- Each write is a commit that wakes every watcher on its tables and one upload operation.
- On the server `EventMessageReadReceipts` has `unique (message_id, user_uuid)` and
  `EventSubscriptions` has `unique (event_uuid, user_uuid)`.

## 3. The change

### 3.0 A helper for several statements in one transaction (commit 0)

`typedWriteTransaction(work)` in `src/lib/powersync/typedQuery.ts`: runs `work` inside
`powerSyncDb.writeTransaction`, so reads and writes of one action share one transaction. It
is timed as `sqlite.batch` and counted in `perfLog` as one write transaction with the number
of statements that ran in it. It changes no behaviour by itself; the next two commits use it.

### 3.1 Read receipts (commit 1)

`markEventMessagesRead(eventUuid, userUuid)` keeps its signature and its in-flight guard, and
does this:

1. **One transaction:** select the ids of the event's messages that have no receipt of the
   user (`not exists`), then insert one receipt per id (`id` a new UUID, `read_at` now). If
   there is nothing to insert, no transaction is opened.
2. **Then, separately,** the update that clears `unread` for the subscription (as
   `clearEventChatUnread` does today).

The rows written are the rows written today: a receipt for every message of the event that
has none, the author's own and system messages included, and `unread = 0`. The re-check read
of today's loop disappears: the select and the inserts now share a transaction, so a
concurrent run cannot slip a receipt in between. Calls: 2 transactions instead of 3 + 2N.

### 3.2 Chat member (commit 2)

Two new functions in `db/conversationActions.ts`, used by the members modal; `leaveEventChat`
is rewritten on top of the second. `subscribeToEvent`, `unsubscribeFromEvent` and
`sendEventMessage` stay as they are (`EventInternalChat.tsx` still calls `subscribeToEvent`).

- **`addEventChatMember(eventUuid, targetUserUuid, message)`:** one transaction that reads
  the subscription, inserts it unless it exists (`unread` 0, `created_at` now), and inserts
  the system message when `message` is not null. Returns the subscription id.
- **`removeEventChatMember(eventUuid, targetUserUuid, message)`:** one transaction that
  deletes the subscription and inserts the system message when `message` is not null.

`message` is `{ userUuid, body }` or null, as the modal builds it today: null when there is no
signed-in user. The message row has the columns `sendEventMessage` writes for a system
message (`is_system` 1, no reply, `created_at` now). Calls: 1 transaction instead of 3.

## 4. Locked contracts

- `markEventMessagesRead(eventUuid: string, userUuid: string): Promise<void>` — unchanged.
- `leaveEventChat(eventUuid, userUuid, actorName): Promise<void>` — unchanged.
- New, in this form:

```ts
type ChatSystemMessage = { userUuid: string; body: string };

typedWriteTransaction<T>(work: (tx: Transaction) => Promise<T>): Promise<T>
addEventChatMember(eventUuid: string, targetUserUuid: string,
  message: ChatSystemMessage | null): Promise<string> // the subscription id
removeEventChatMember(eventUuid: string, targetUserUuid: string,
  message: ChatSystemMessage | null): Promise<void>
```

Changing any of these needs a new "Approved".

## 5. What changes in behaviour

- **A member action is all or nothing.** Today the subscription can be written and the
  message fail, or the other way round; after this step both are written or neither.
- **One upload transaction per member action.** The operations are still sent one at a time,
  in the same order (subscription, then message). If one is refused (for example a duplicate
  subscription that already exists on the server, class 23), the upload discards the rest of
  that transaction, so the system message is not posted either. Today the message would be.
- **Receipts:** a refused receipt (a duplicate from another device, or a role without the
  insert permission) discards the rest of that run's receipts on the server, where today it
  discards only itself. The unread reset is a separate transaction and is not affected (D2).
  Locally everything looks read either way.

## 6. Edge cases and error handling

- A chat with no messages: no receipts transaction; only the unread reset, as today.
- Every message already has a receipt: no receipts transaction; the unread reset still runs.
- Two runs at once for one chat: the in-flight guard stays; the select inside the transaction
  also makes a second run in another tab see the first one's receipts.
- No signed-in user in the members modal: no system message, as today.
- A failing statement rolls the whole transaction back and the error reaches the caller; the
  modal shows its error toast as before and nothing was written.
- The apply of a large sync set (the measured 10 s wait) can still delay a transaction like
  any other call. This step does not change that.
- Offline: local writes as before, uploaded later.

## 7. Tests (TDD: written first, red, then code)

A small fake of `powerSyncDb` runs on Node 24's built-in `node:sqlite` (`getAll`, `execute`,
`writeTransaction`, and a count of transactions); `SystemProvider` is mocked to hand the
functions that fake and a compile-only Kysely.

- **Differential, read receipts:** the old implementation is kept verbatim in the test; for
  at least 200 seeded datasets the old and the new function run on copies of one database
  and must leave the same receipts (by message and user), the same `unread` flags and no
  duplicate receipt; the old function's transactions are counted (3 + 2N writes and reads)
  and the new one must use at most two.
- **Differential, members:** the same for add, remove and leave: same subscription rows and
  same system message rows (ids and timestamps are not compared), one transaction.
- **Unit tests:** the cases of section 6; a failing statement leaves nothing written; the
  helper counts one transaction with its statements.

Manual checks (the user; Clerk sign-in is not available to the assistant, and no local
Playwright run, so E2E is SKIPPED): open a chat with unread messages, its badge and the
Header count clear; add and remove a member, the list moves, the system message appears.

## 8. Measurement

Plan section 3 rules. Per action, `perfLog.clear()`, the action, `perfLog.report()`: the read
and write counters and the write-transaction count. Actions: open a chat with N unread
messages; add a member. M6s as in the step 1 spec for the same actions. Expected, as a
hypothesis: fewer transactions, commits and watcher rounds per action; no change to the wait
during an apply (S2b showed it does not depend on the call count).

## 9. Rollback and commits

Three commits, `perf(local-db) step 2: <part>`: the helper, the read receipts, the members.
Parts 1 and 2 are independent of each other; both use part 0. Revert 2, then 1, then 0.

## 10. Permissions

Unchanged: the same rows are written by the same user under the same row-level rules.
`permissionPageData.ts` is not touched.

## 11. Files

Counted production files: 4 — `typedQuery.ts`, `readReceipts.ts`, `conversationActions.ts`,
`EventChatMembersModal.tsx`. Tests are not counted: the differential and unit tests of each
part, and one test file for the helper.

## 12. Definition of done (every commit)

`npm run tc`; `npx vitest run` on the new tests, then the whole suite; Prettier `--check` on
the touched files only; E2E SKIPPED; the manual checks of section 7 and the measurements of
section 8 are the user's.

## 13. To confirm at review

- That leaving a chat (`leaveEventChat`) belongs to "chat member": it is the same shape as
  removing, and it is written on top of `removeEventChatMember`.
- That where commits live is as in the plan.
