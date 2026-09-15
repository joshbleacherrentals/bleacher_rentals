# Work Tracker Alert Cascade — Performance

Status: **approved and implemented** · Covers steps 2–4 of the agreed fix order.
Step 1 (bound the ripple by date) and step 5 (cheap wins) are out of scope here.

Implementation notes, added after approval:

- **Collapsing loses `previous_bleacher_uuid` unless it is accumulated.** Dragging
  A → B → C faster than one cascade completes would have left the trailing run
  knowing only about A and C, so the events on B kept a stale transportation
  alert. `triage.ts` now accumulates previous bleachers per tracker and each run
  drains the set. Covered by a test.
- **The fire-and-forget decision lives in one module**, `scheduleTriage.ts`,
  rather than being repeated as `.catch()` at each call site.
- **`deleteWorkTracker` still awaits its triage.** It removes alerts for a row
  that is going away and is not dedup-keyed; only its lazy import was dropped.
- **Per-alert `[QUOTE_TRIAGE]` console logging was dropped from the save
  cascade.** At 60 alerts per cascade the logging was itself a measurable cost,
  and `perfVerbose` already covers the same ground opt-in.

## Instrumentation: stays

`perfTrace` stays in the tree. It costs two integer increments per query, prints
only at phase boundaries, and it is the only way to check this work has not
regressed. One caveat is unchanged and worth repeating: the `reads=`/`writes=`
counters are global, so any overlapping work is attributed to whichever trace is
open. Phase durations and the ripple count are the trustworthy numbers.

## Problem

Saving or moving a work tracker awaits an alert triage cascade. Measured worst case:

```
moveWorkTracker 14.14s — update tracker 66ms → alert triage 14.08s
```

Three multipliers, in the order they will be removed:

| #   | Multiplier                | Effect                                                     |
| --- | ------------------------- | ---------------------------------------------------------- |
| 1   | Unbounded ripple (done)   | up to 30 events × 2 defs = 60 `syncAlert` calls            |
| 2   | No dedup                  | 8 drags in 5s → 8 concurrent cascades, 6 in flight at peak |
| 3   | One transaction per write | 4–9 IndexedDB round-trips per `syncAlert`, 20–100ms each   |
| 4   | Blocking `await`          | the whole cascade sits in front of the spinner             |

Contention is the compounding factor: the same `syncAlert "No Transportation"`
took 13ms idle and 1.22s with six cascades in flight — identical work, 90× slower.

## Cascade contract

A **cascade** is one run of `triageWorkTrackerSaved` for one work tracker id. Its
contract, unchanged by this work:

- **Input:** a work tracker id plus the bleacher it was on before the save.
- **Scope:** the work-tracker-level definitions for that tracker, plus every
  `bleacher_event` definition for every in-window BleacherEvent on the previous
  and the current bleacher.
- **Output:** the `Alerts` / `UserAlerts` rows for those entities match what the
  definitions say they should be, given the data at the moment the cascade _ran_.
- **Guarantee:** eventual, not immediate. The nightly cron
  (`src/app/api/cron/alerts/route.ts`) re-derives the same alerts from scratch,
  so a cascade that is skipped, superseded or lost costs at most staleness until
  the next cron run — never a permanently wrong row.

That last point is what makes steps 2 and 4 safe. It is the load-bearing
assumption of this spec; if the cron is ever removed, steps 2 and 4 must be
revisited.

## Step 2 — Deduplicate in-flight cascades

**Semantics: latest-wins collapse, keyed by work tracker id.**

- A cascade for tracker `X` that starts while a cascade for `X` is already
  running does not start a second run. It marks the in-flight run as _stale_ and
  returns the promise of a single follow-up run.
- When the in-flight run finishes and a stale flag is set, exactly one follow-up
  run executes — regardless of how many requests arrived while it was running.
  Eight rapid drags of one tracker therefore produce **two** cascades (the first,
  plus one trailing run that reflects the final position), not eight.
- Keying is per tracker id. Two different trackers still cascade concurrently;
  this step does not serialize unrelated work.
- The dedup key lives in a module-level `Map<string, CascadeEntry>` in
  `src/features/alerts/cascadeQueue.ts`. In-memory only: it is a
  request-collapsing optimisation, not durable state, and a page reload legitimately
  starts from a clean map.
- Rejections do not poison the key. A failed run clears its entry so the next
  save can cascade again.

**Why trailing-run rather than cancel-in-flight:** a cascade is a sequence of
awaited DB writes with no cancellation token. Aborting mid-run could leave one
BleacherEvent's alerts updated and the next one's not. Letting the run finish and
re-running once is both simpler and always converges on the latest data.

**Seams under test** (`src/features/alerts/cascadeQueue.test.ts`) — pure, no DB:

1. N requests for one key while a run is in flight produce exactly 2 runs.
2. Requests for different keys run concurrently and are not collapsed.
3. A rejected run clears its key; the next request starts a fresh run.
4. The trailing run observes state written after the first run began.

## Step 3 — One transaction per cascade

Today each `typedExecute` in `engine.ts` is its own transaction, and each one
wakes every `useTypedQuery` watching the touched tables. Under
`IDBBatchAtomicVFS` (see `SystemProvider.tsx:39` — the OPFS-deadlock workaround,
not to be reverted) that is 20–100ms of IndexedDB per write.

**Change:** `syncAlert`'s _reads and evaluation_ stay as they are; its _writes_
are collected into a plan and applied once per cascade inside a single
`powerSyncDb.writeTransaction`.

- New: `typedExecuteBatch(compiled: CompiledQuery[])` in
  `src/lib/powersync/typedQuery.ts`, one write transaction, counted as one
  round-trip batch by `perfTrace`.
- `syncAlertsForEntity` gains a variant that **returns** its delete/update/insert
  statements instead of executing them. The existing executing form stays, so the
  `Events` triage paths and any other caller are untouched by this step.
- Transaction boundary = **one cascade**. Either every alert row the cascade
  derived lands, or none does. That is a strictly stronger guarantee than today's
  per-statement commits, where a mid-cascade failure leaves a half-updated set.
- Ordering inside the batch is preserved: deletes, then updates, then inserts
  (`Alerts` before its `UserAlerts`, so the FK is satisfied at commit).

**Offline / PowerSync behaviour:** unchanged in kind. Writes go to the local DB
and PowerSync replicates them when connectivity returns; batching changes only
how many local transactions carry them. Watched queries fire once per cascade
instead of ~100 times — that is the point.

**Seams under test:** the statements a cascade produces for a given evaluation
result (order and content), and that they are handed to the batch helper in one
call rather than N.

## Step 4 — Stop awaiting the cascade

Only after 2 and 3. Un-awaiting first would make things worse: the spinner is
currently the only thing throttling the user, so removing it lets more cascades
pile up, and it removes no work at all.

- In `saveWorkTracker` / `moveWorkTracker`, the triage call drops its `await`;
  the `try/catch` becomes `.catch()` so rejections are still logged, never
  unhandled.
- The `alert triage` trace phase stays, but now measures the time to _schedule_
  the cascade. The cascade reports its own `triageWorkTrackerSaved` trace when it
  completes, so before/after numbers remain comparable.

**Trade-off, decided:** a cascade that is not awaited may not finish if the tab
is closed mid-run. Accepted. The cost is bounded by the cron contract above —
alerts for the affected entities can be stale until the next cron run, and no row
is left inconsistent because step 3 made the cascade atomic. We are _not_ adding
a `beforeunload` blocker or a service worker for this; blocking a tab close to
finish an advisory alert re-evaluation is a worse user experience than a
few hours of alert staleness in a rare case.

## Non-goals

- The Pusher broadcast path (`updateDataBase` → `fetchTableSetStoreAndCache`).
  It never fired in 307 logged entries; unmeasured, so untouched.
- `LogLevel.DEBUG` in `SystemProvider` — noted, handled separately.
- The `Events` triage paths. They share `syncAlert` and benefit from step 3's
  batching where they opt in, but their ripples are not dedup-keyed here.

## Permissions

No change to `permissionPageData.ts`. Alerts are not a matrix capability — who
receives an alert is decided by each definition's `recipients()`, and this work
changes only when and how often a cascade runs, not who may run it or see the
result. (Verified: no alert rows exist in the matrix today.)

## Definition of Done

`npm run tc`, `npx vitest run`, Prettier on touched files only, plus the
before/after table: `moveWorkTracker` total, `alert triage` phase and `alert
ripple` count, for one drag and for eight rapid drags of one tracker.

---

# Round two — bounding the per-definition scans

Status: **awaiting approval** · Covers item 1 only. Items 2
(`syncWorkTrackerLineItems` batching) and 3 (early-exit an empty cascade) are
local and proceed without a spec.

## Problem

Round one removed the blocking and the transaction storm. What is left is that
each alert definition scans the bleacher's **entire history** — few reads, but
expensive ones:

| Definition               | Worst measured | Reads |
| ------------------------ | -------------- | ----- |
| Pickup Location Mismatch | 1.19s          | 4     |
| Scheduling Conflict      | 795ms          | 4     |
| No Transportation        | 732ms          | 6     |

Because cascades still compete for the single wa-sqlite worker, this shows up as
foreground degradation: `moveWorkTracker` 75–110ms quiet → 514ms under cascade,
`readWorkTrackerForModal` 23–65ms → 217–290ms. Shortening the cascade is what
removes the contention.

## Approach: push the selection into SQL, leave `resolveAddress` untouched

`resolveAddress` / `resolveAddressFull` are max/min selections. Over 2 candidate
rows they return exactly what they return over 2000 — **provided the candidates
are chosen with the same predicates**. So the change is only to how rows are
fetched: `ORDER BY … LIMIT 1` per source instead of the whole history.
`resolveAddress` and its tests are not touched.

The equivalence holds only if every JS filter is mirrored exactly. Three
subtleties make that non-trivial, and all three are places where a plausible
implementation is silently wrong.

### Subtlety 1 — the two functions do not use the same comparison

They look symmetric. They are not:

|                                 | events                           | work trackers                    |
| ------------------------------- | -------------------------------- | -------------------------------- |
| `resolveAddress` past           | `date <= target`                 | `date <= target`                 |
| `resolveAddress` **future**     | `date > target` (**strict**)     | `date > target` (**strict**)     |
| `resolveAddressFull` past       | `date <= target`                 | `date <= target`                 |
| `resolveAddressFull` **future** | `date >= target` (**inclusive**) | `date >= target` (**inclusive**) |

`resolveAddress` future excludes the target date; `resolveAddressFull` future
includes it. Each SQL bound mirrors its own function. Copying one bound to the
other changes behaviour on the boundary date only — exactly the case a casual
test would miss.

### Subtlety 2 — `event_start` is a timestamp, `targetDate` is not always a date

The JS compares `DateTime.fromISO(event_start).toISODate()` — a **local** date —
against `targetDate` as a string. `Events.event_start` is a timestamp column, so
the SQL bound must be an instant, the same lesson as `upcomingWindowEndInstant()`.

And `targetDate` is not always date-shaped: `bleacherTransportation` passes
`be.event_start`, a full timestamp. The existing JS handles this by accident of
string ordering — `"2026-09-20" <= "2026-09-20T14:00:00Z"` is true, so same-day
rows are included, while `"2026-09-21"` is correctly excluded.

That reduces exactly to comparing against the first 10 characters of
`targetDate`. So: **derive the bound from `targetDate.slice(0, 10)`**, then
convert to an instant at the local day boundary. The existing behaviour —
including the same-day-inclusive quirk — is preserved rather than "corrected",
because correcting it here would change which alerts fire.

New helpers in `getUpcomingWindow.ts` (or a sibling), each tested directly:

- `localDayStartInstant(dateStr)` → local 00:00:00.000 of that date, as ISO
- `localDayEndInstant(dateStr)` → local 23:59:59.999 of that date, as ISO

### Subtlety 3 — a filter missed in SQL turns a row into a null, not a wrong row

With the full history, a nearest row rejected in JS simply let the next-nearest
win. With `LIMIT 1`, a row the SQL returns and the JS then discards produces
`null` — the alert silently stops firing. So every JS filter must be in the
`WHERE`, not just the date bound:

- events: `event_status = 'booked'`, `deleted = 0`, `street IS NOT NULL AND street != ''`
- work trackers (past): `dropoff street IS NOT NULL AND != ''`; for
  `resolveAddressFull` also `dropoff_address_uuid IS NOT NULL`
- work trackers (future, `resolveAddressFull`): the **pickup** address instead
- `excludeWorkTrackerUuid` where the caller passes one

The empty-string check matters: the JS maps `address: r.address ?? ""` and then
skips falsy, so `''` is a reject. `IS NOT NULL` alone is not enough.

## Query shapes

Per source, direction `past`:

```sql
WHERE <date column> <= :bound
  AND <every JS filter above>
ORDER BY <date column> DESC
LIMIT 1
```

Direction `future`: `>= :bound` (or `>`, per subtlety 1), `ORDER BY … ASC`.

The two candidate rows then go to `resolveAddress` unchanged, which still applies
the tie rule (event wins on an equal date) and still re-checks every predicate.
The JS remains the source of truth; SQL only reduces how many rows it sees.

### `schedulingConflict` — an overlap predicate, not a window

Different shape: it needs overlapping events, so it gets

```sql
WHERE e2.event_end   >= :thisSetupStartOrEventStart
  AND e2.event_start <= :thisTeardownEndOrEventEnd
```

Deliberately **slightly wider** than the JS check, with the existing JS
comparison kept as the source of truth. Behaviour cannot change; only the row
count drops. No `LIMIT` — it must still find any conflict, and it returns on the
first one.

## Testing

The highest-value tests assert that one-candidate fetching yields the same result
as full-history, specifically where the nearest row is filtered out:

1. nearest event is unbooked → the older booked event wins
2. nearest event has an empty street → the older one wins
3. nearest work tracker is the excluded one → the next wins
4. an event and a work tracker on the same date → the event wins (tie rule)
5. boundary date, both directions, both functions (subtlety 1)
6. an event whose UTC timestamp is a different local date than its UTC date
   (subtlety 2)

`getExpectedAddressFullForWorkTracker` is user-visible through the modal's
locate buttons (`handlePopulatePickupFromLastAddress` /
`handlePopulateDropoffFromNextAddress`), so both directions are covered and
Playwright runs.

## Permissions

No change expected — this alters query shapes, not who may do anything. Will be
re-confirmed against `permissionPageData.ts` rather than assumed.
