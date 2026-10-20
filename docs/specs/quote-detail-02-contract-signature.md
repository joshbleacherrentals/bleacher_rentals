# Quote detail 02: the contract signature

Status: **IMPLEMENTED 2026-10-15, uncommitted, awaiting review** (approved the same day;
not deployed). 0 open decisions (D1 and D5 answered 2026-10-14); the deploy time is for review
(section 13). Spec 2 of
[quote-detail-reactive-plan.md](quote-detail-reactive-plan.md). Request (user, 2026-10-14): the
page should be reactive; the Signed banner on the Contract tab is one of the parts that is
not.

## 0. The request, and what it is not

**In scope:** where the Signed banner (signer name and signing time) gets its data.

**Not in scope:** the signing flow (`/api/contracts/sign`), the terms HTML, the rule that
invalidates a signature, the public quote page.

## 1. Decisions taken

**D1 — where the banner reads from.** Facts first:

- Today `ContractTab.tsx:216` calls `GET /api/contracts/:id` once. The route returns the
  terms HTML (unused by the tab) and the active signature, and returns no signature at all
  when the event has no `terms_and_conditions_uuid`.
- The local table `ContractSignatures` exists (`AppSchema.ts`). The sync rules give it to
  account managers and to the `Users` streams (admin, viewer). The accountant stream has no
  `ContractSignatures`.
- The sync file is Sync Streams edition 3 and production runs `powersync-service:1.20.5`
  with MongoDB storage and no storage version set. By PowerSync's documentation, a deploy
  of any change to the file recreates every bucket and **every web client downloads its data
  again once**, not only the role the change is for (plan, F5: from documentation, not
  tested on this server). For an admin that is about 48k to 65k operations, about 24 s of a
  blocked database worker on a Mac.

Options:

- **Keep the HTTP call.** Works for every role. The banner does not change while the page
  is open. No sync rules change, no resync. This spec has nothing left to do.
- **Read the local table only.** The banner is live for admin, viewer and account manager.
  Accountants stop seeing the banner, because they do not have the table.
- **Read the local table and add it to the accountant stream.** Live for every role. One
  line in `sync_rules.yaml`; deploying it makes every web client download its data again
  once (the figures above); rolling back is another deploy and another download.
- **Read the local table, and add it to the accountant stream with the next sync rules
  change that happens anyway.** Live for admin, viewer and account manager at once;
  accountants have no banner until that deploy.

User's answer: **read the local table and add it to the accountant stream.** First given
2026-10-14; asked again after the resync fact above, and confirmed the same day ("add the
rule").

**D5 — how the new line is written in `sync_rules.yaml`.** Asked because a role added to a
user should not make the client download the table again. Checked on 2026-10-14 with the
service's own sync-rules library (the container `br_powersync-powersync-1`), for 119 users:
102 real local rows and 17 synthetic users covering every role combination.

- **One line with the four roles joined by OR.** Compiles. Every user gets the same tables and
  the same number of buckets as with four lines: PowerSync splits the OR back into one term
  per role, and each term lands in that role's existing bucket. A shorter way to write the
  same thing; no saving when a role is added.
- **One line with no role check.** One shared bucket for everyone, so no download when a role
  changes. But every active web user receives the table, maintainers, developers and users
  with no role included (39 of the 102 real local users newly receive it).
- **One line on a derived flag in the database** (a column on `Users` kept by triggers from
  `is_admin`, `is_viewer`, `AccountManagers` and `Accountants`). One shared bucket for the four
  roles only, and a role added to a user who already holds another of the four gives 0 new
  buckets. Needs a migration, `AppSchema.ts`, the types and tests, and one more bucket per
  user for this table alone. Its own spec if ever wanted.
- **Separate lines, as the file does today.**

User's answer: **separate lines.** One new line for the accountant, in the file's existing
form; the three lines that exist (viewer, account manager, admin) stay as they are.

## 2. What the code does today

See D1. `ContractTab` holds the signature in `useState`, filled by a `useEffect` keyed on
`quote.id`; a failed call is swallowed (`.catch(() => {})`), so offline the banner is
silently absent.

## 3. The change

New `hooks/useContractSignature.ts`: `useContractSignature(eventId, hasTerms)` reads `select
id, signer_name, signed_at from ContractSignatures where event_uuid = ? and status = 'active'
order by signed_at desc limit 1` with `useTypedQuery`, and returns no signature when
`hasTerms` is false, as the API route does. `ContractTab` drops its `fetch`, its `useEffect`
and its signature `useState`, and passes `quote.termsAndConditionsUuid !== null` as
`hasTerms`.

One new line in `../br_powersync/config/sync_rules.yaml`, in the accountant block, in the
whole-table form of its neighbours (the `EventFiles` line of that block is the template),
with a comment naming this spec. The existing lines for viewer, account manager and admin do
not change. `AppSchema.ts` already has the table; no migration.

**Order of release:** the sync rules first, the app second; the other order leaves
accountants without the banner in between.

## 4. Locked contracts

```ts
// hooks/useContractSignature.ts
export function useContractSignature(
  eventId: string,
  hasTerms: boolean,
): { signature: { signerName: string; signedAt: string } | null; isLoading: boolean };
```

## 5. Behaviour that must not change

- The banner text and format: "Signed: <time> by <name>".
- No banner when the contract is invalidated (`status` is not `active`) or when the event has
  no terms.

## 6. Edge cases and error handling

- The accountant right after the sync rules deploy: no banner until `ContractSignatures` has
  downloaded.
- Two active rows for one event: the newest by `signed_at` is shown (the API route would fail
  on two; there is a partial index for the active row).
- A signature invalidated by an edit while the page is open: the banner disappears, live.
- Offline: the banner works from the local table; the HTTP call failed silently.

## 7. Tests (TDD: red first, then code)

1. `useContractSignature.test.tsx`: active only; none when `hasTerms` is false; the newest
   when two rows are active; none when the only row is invalidated. As built: the query runs
   on a real SQLite (`node:sqlite`), so "active" and "newest" are checked on rows; the hook is
   rendered on the server with `useTypedQuery` replaced for the rest.
2. `ContractTab.test.tsx`: the banner shows for the signature the hook gives and not otherwise;
   the label is "Invoice #" with a signature and "Quote #" without; the hook is asked for its own
   quote and for the right `hasTerms`; the source no longer calls the contracts route. A server
   render shows one state at a time; "disappears with the rows" is the Playwright scenario.
3. Playwright, written per CLAUDE.md and **not run locally**:
   `e2e/contractSignatureBanner.am.spec.ts` and `e2e/contractSignatureBanner.accountant.spec.ts`
   share `e2e/helpers/signatureBannerScenario.ts`: a signature recorded for the quote shows the
   banner on an open page, and a price change that invalidates it removes the banner, each with
   no reload. The accountant spec needs the sync rules deployed first. The helper
   `recordSignature` was added to `e2e/helpers/quoteTestData.ts`.

## 8. Measurement

- **Done offline (2026-10-15), on the edited file itself, the service's sync-rules library, 119
  users (102 real local rows and 17 synthetic role combinations):** 0 compile errors. The result
  changes for 4 users, all synthetic ones that hold the accountant role, and the only table that
  changes is `ContractSignatures`; the number of buckets per user is unchanged. One user, a
  plain accountant, newly receives the table. Three users who hold accountant and another role
  (admin, account manager, or everything) now receive it a second time, once from each role's
  bucket: that is what separate lines per role cost (20 rows locally). No real local user holds
  the accountant role, so none of the 102 changes; an inactive user still receives nothing.
- The time to download after the deploy, on the local PowerSync stack first; the production
  figure is the user's.

## 9. Rollback and commits

One commit, `reactive(quote-detail): read the contract signature locally`, plus one commit in
`../br_powersync` for the sync rules line. Rollback: `git revert`, and redeploy the previous
sync file (another download for every client).

## 10. Permissions

The accountant already sees the signature on the Contract tab (the matrix says they read the
Contract, Billing and Log tabs). Only the source of the data changes; no row of
`permissionPageData.ts` changes.

## 11. Files

2 counted files under `src/features/quotesAndBookings/`: `hooks/useContractSignature.ts`,
`components/quoteDetail/tabs/ContractTab.tsx`; and `../br_powersync/config/sync_rules.yaml`
(does not count).

## 12. Definition of done

As in the plan, section 6. Result (2026-10-15):

- `npm run tc`: the same errors as before the change (4 kinds, 12 lines), none in these files;
  they come from an uncommitted regeneration of `database.types.ts` that is not part of this
  spec.
- `npx vitest run`: 319 files, 3725 of 3726 tests pass. The one failure is
  `eventChat/db/readReceipts.differential.test.ts`, which times out at 5 s when the suite runs
  in parallel and passes alone; it failed the same way before this spec.
- Mutation-checked: the query without the `active` filter, with the oldest first, and the hook
  ignoring `hasTerms` are each caught; the new `ContractTab` test fails 5 of 6 against the old tab.
- Prettier: clean on the 8 touched files. E2E: SKIPPED, not run locally.
- Not checked in a browser: the page is behind a Clerk sign-in. The sync rules file is changed
  in `../br_powersync` (uncommitted there) and NOT deployed.

## 13. To confirm at review

- When the sync rules deploy may run. Every web client downloads its data again once (plan,
  F5), so the time is the user's call; the app release follows it.
