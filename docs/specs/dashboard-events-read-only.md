# Dashboard: events are read-only

Status: **Approved 2026-11-04**, with the readings of section 10 as written, and
**implemented 2026-11-04**; uncommitted, not deployed. What differs from the text is in
section 12. Every decision is answered by the author (section 2).
Branch: `q4-sprint2-collections`. No migration, no sync-rule change, no new table.

## 1. The request

The author's numbered list of 2026-11-04 (translated):

1. Remove the ability to create events from `/dashboard`.
2. Remove the ability to edit events from `/dashboard`.
3. Only selecting bleachers and changing the colour is allowed.
4. Moving events between bleachers stays allowed.
5. In place of edit there is a view of the event's information: every input becomes
   read-only but stays on screen. The Create / Update / Delete buttons are removed.
6. The Quote button goes to `/quotes-bookings/{id}`, not to `/quotes-bookings/{id}/edit`.
7. Creating, editing, deleting and moving Sub-Rental, Maintenance and Work Tracker stays
   possible. No change to that.

**What the code does today** (so this spec can be built in a chat of its own):

- The dashboard toolbar (`CreateEventButton.tsx`) is a split button: "+ New Event" opens the
  event panel for a new event; its menu has "Maintenance Event" and "Sub-Rental Request".
- Clicking an event on the grid calls `loadEventForModal(id, "dashboard")`. That copies the
  event into `useCurrentEventStore` and opens the panel (`EventConfiguration.tsx` →
  `EventConfigurationForm.tsx`, tabs Core / Details / Alerts) above the grid.
- Clicking an empty cell opens the cell popup (`CellEditor.tsx`): Work Tracker, Create
  Event, Maintenance, Create Sub-Rental.
- The panel's header has the tabs, a palette button with a hue slider, Quote, Delete Event
  and Create / Update Event. The fields sit in `<fieldset disabled={!canEdit}>`; when
  `!canEdit` a yellow banner says "You have read-only access to this event."
- While the panel is open every bleacher row on the grid shows +/–. It only changes the
  panel's draft; Update writes it. Rows also show a Swap button for an existing event.
- The same form opens as a global pop-up, `EventConfigModal.tsx` (titled "Create Quote",
  mounted in `SignedInComponents.tsx`), when a user clicks an event alert.
- Update (`updateEvent.ts`) writes the whole `Events` row and the `BleacherEvents`
  difference, then calls `triage`. It refuses an event with no bleacher ("Select at least
  one bleacher", `checkEventFormRules`).

## 2. Decisions (all answered by the author, 2026-11-04)

**D1 — How a bleacher choice and a colour change are saved, with no Update button.**

- **A, at once:** a click on +/– writes at once; the colour is written when the slider is
  released. No button. A stray click changes data immediately.
- **B, a small Save button:** one new button that writes only bleachers and colour.
- **C, colour at once, bleachers by Swap only:** +/– disappears; the bleachers of an event
  change only by moving (item 4).
- User's answer: **A.** The author added the rule, in their words (translated): "When an
  event is selected, the window is open at the top, and any bleacher can be attached to or
  removed from the event. That is possible until (a) the event's window is closed with its
  close button, or (b) it is closed by opening another event. The window allows removing
  all bleachers from the event."

**D2 — The pop-up "Create Quote" (opened by an event alert, over `/dashboard`).**

- **Keep it, read-only:** same pop-up, same form, no save or delete buttons.
- **Remove it:** an alert click opens the read-only panel on the dashboard.
- **Keep it editable:** then an event can still be edited on `/dashboard` through an alert,
  which contradicts item 2.
- User's answer: **keep it, read-only.**

**D3 — Who sees the Quote button.** Today only those who can edit the event.

- **As now:** admin, and an account manager on their own events.
- **Everyone with access to Quotes & Bookings:** admin, account manager, viewer. A
  maintainer has no such page and does not see it.
- User's answer: **everyone with access to Quotes & Bookings.**

**D4 — The toolbar button, once "New Event" is gone.**

- **One button with a menu**, or **two separate buttons.** The label of the one button was
  asked separately: "+ New" or "+ Create".
- User's answer: **one button with a menu, labelled "+ Create".**

**D5 — Who may change colour and bleachers** (today the rule behind Update, `canEdit`).

- **The same rule as Update** (`canEditOwnedEntity`): admin, any event; an event with a
  bleacher from a zone the user cannot access, only its owner; otherwise an account manager
  who leads a zone, any event, and any other account manager only an event they own;
  viewer and maintainer, never.
- **Any admin or account manager,** on any event. Wider than today.
- User's answer: **the same rule as Update.**

**D6 — Removing the last bleacher from an event.**

- Today Update refuses an event with no bleacher.
- User's answer: **allowed.** See D1: the author wants any bleacher attachable and
  removable while the panel stays open, including all of them.

**D7 — Rights on Swap** (the handler has no role check today; whether the database refuses
a viewer was not checked).

- **No change,** or **the same rule as for bleachers.**
- User's answer: **no change.**

**D8 — The yellow read-only banner.**

- **Remove,** keep as it is, or a new text for everyone.
- User's answer: **remove.**

**D9 — +/– for someone without the right on this event** (viewer, maintainer, an account
manager on an event they cannot edit). Today it is visible and a viewer's click does
nothing.

- **Hide it,** or **show it and answer a click with an error.**
- User's answer: **hide it.**

**D10 — The "locate" button next to Event Start / Event End** (scrolls the grid to the
date). Today a read-only user has it disabled, because the whole field block is disabled.

- **Active for everyone** (navigation, not editing), or **disabled with the fields.**
- User's answer: **active for everyone.**

**D11 — Code that nothing calls after this change.**

- **Delete it in the same change,** or **leave it and remove only the entry points.**
- User's answer: **delete it in the same change,** with its tests.

## 3. What changes

### 3.1 Toolbar — `CreateEventButton.tsx`

- The "+ New Event" main action goes. The split button becomes one button, **"+ Create ▾"**
  (D4), whose menu has **Maintenance Event** and **Sub-Rental Request**, doing what they do
  today.
- The viewer rule stays: a user who is neither admin nor account manager sees no button.
- The Minimise / Expand / Close controls of the three forms (event panel, maintenance,
  sub-rental) stay as they are. The code that fills in the owner of a _new event_ goes.

### 3.2 Cell popup — `CellEditor.tsx`

- The **Create Event** icon and `handleCreateEvent` go.
- Work Tracker, Maintenance and Create Sub-Rental, the note text and its Save / Delete stay
  exactly as they are (item 7).

### 3.3 The panel and the pop-up — `EventConfigurationForm.tsx`, `CoreTab.tsx`, `DetailsTab.tsx`

**Removed from the form:** the Create Event / Update Event / "Saving…" button; Delete Event
and its confirmation; `handleCreateEvent`, `handleUpdateEvent`, `handleDeleteEvent`,
`lostReasonBlocks`, `resolveSaverUuid`; the read-only banner (D8); the `showDelete` prop;
the "unsaved event → `/quotes-bookings/new`" branch of `handleOpenDetails`.

**Kept:** the tabs Core / Details / Alerts and their warnings, the two alert hooks, the
palette button and slider (3.5), the Quote button (3.6), and for the pop-up its footer
"Open in Dashboard" and "Cancel".

**Every field is read-only and still on screen:** Event Name, the venue picker, Event
Start / End, Good Shuffle, Owner (and Setup / Teardown where `showSetupTeardown` is on);
Status, Lost reason, Booked At, Created At, Notes. The Bleacher Requirements list and the
Alerts tab are read-only already. The control must look disabled and accept no input.

**The two "locate" buttons stay enabled** for every role (D10). How the fields are locked
while they stay enabled (a `disabled` on each field, or a `fieldset` around the fields
only) is left to the build; the component test fixes the outcome.

**Logic removed because nothing can edit or save any more:**

- in `CoreTab`: every `onChange`; the effect that adjusts dates (it writes into the store
  for a form that can no longer be edited); the effect that fills in the owner of a new
  event; the date `min` / `max` from sub-rental bounds (`useSubrentalBlockBounds`,
  `laterDate`, `earlierDate` stay for the maintenance form);
- in `DetailsTab`: every `onChange`; the effect that defaults `bookedAt` (reading R4).

### 3.4 Bleachers — saved at once

The +/– handler in `StickyLeftColumnCellRenderer.ts`, for the event panel:

1. If `canEditEvent(...)` is false, do nothing. The button is hidden anyway (D9).
2. The account-manager guard for **assigning** stays as it is (a bleacher they do not own,
   or that is subrented out in the range, is refused with the same toast).
3. Update `useCurrentEventStore.bleacherUuids` at once (the grid reacts, as it does now),
   then write with `setEventBleacherLinked` and call `triage` (reading R2).
4. If the write fails: put the bleacher back as it was and show an error toast.
5. **No minimum.** The last bleacher can be removed (D6). The panel stays open and any
   bleacher can be attached again, until the panel is closed with its close button or
   another event, a maintenance event or a sub-rental is opened (D1).

+/– is drawn only when the panel is open **and** `canEditEvent(...)` is true (D9). The
maintenance and sub-rental forms keep today's behaviour. **Swap is not touched** (D7): it
appears with the panel open, for the same people as today, and still closes the panel after
a confirmed swap. `subrentalConstraint` is no longer set for the event form.

### 3.5 Colour

- While the slider moves, `hslHue` changes in the store and the grid previews it, as now.
- When the user lets go (pointer up, touch end or key up) the value is written with
  `setEventHue`, **only if it differs from the value when the gesture began.**
- A failed write puts the slider and the preview back to the value before the gesture and
  shows an error toast.
- The palette button and slider are drawn only when `canEditEvent(...)` is true (D5), in
  the panel and in the pop-up.

### 3.6 Quote button

- Label and tooltip stay ("Quote", "Open Quote").
- Drawn for a user whose roles allow `/quotes-bookings`, checked with `canAccessPath`:
  admin, account manager, viewer — not a maintainer (D3). Roles add up: an account manager
  who is also a maintainer sees it.
- Always goes to `/quotes-bookings/{eventUuid}`. There is no `/edit`, and no "new quote"
  branch.

### 3.7 The pop-up (`EventConfigModal.tsx`)

Same form, so it gets everything in 3.3, 3.5 and 3.6. It has no grid behind it, so it has
no +/–. Its title and footer stay (reading R7).

### 3.8 Permissions page — `permissionPageData.ts`, same commit

- **Events**, description unchanged. Admin: keep the sentence about creating and editing
  any event, say it is on the Quotes & Bookings page, and add: on the Dashboard an event
  opens read-only; an admin can still change its colour, add or remove its bleachers and
  move events between bleachers, but cannot create, edit or delete an event there.
- **Events**, account manager: "freely create events" becomes "on the Quotes & Bookings
  page"; add that on the Dashboard they cannot create or edit events, may change the colour
  and bleachers only of an event they could also edit, and can move events between
  bleachers.
- **Events**, viewer: add that on the Dashboard they can open an event to read it, and the
  Quote button takes them to its page.
- **Events**, maintainer and accountant: unchanged (still true).
- **Dashboard Cells**, account manager: "create notes and events on cells" becomes "create
  notes on cells, and work trackers, maintenance events and sub-rentals from a cell".
- No other entry changes. Exact wording is written at build time from these points.

### 3.9 Deleted code (D11)

Only what nothing calls after 3.1–3.8. Each deletion is checked with `grep` and
`npm run tc` before it goes.

- `createEvent` and `deleteEvent` in `dashboard/db/client/db.ts`.
- `dashboard/db/client/updateEvent.ts` (the whole file).
- `checkEventFormRules` in `dashboard/functions.ts`.
- `CurrentEventState.subrentalConstraint` in `useCurrentEventStore.ts`, its reset, and its
  three writers for the event form: `CellEditor.tsx`, `EventBody.ts` (`handleLoadEvent`),
  `StickyLeftColumnCellRenderer.ts`. The maintenance store keeps its own field.
- Tests that only covered the removed code, and e2e scenarios S3 and S9 (reading R9).
- Not deleted, though unused before this change: `LenientSelections.tsx`, `openModal` on
  the store (section 9).

## 4. Types and contracts that are locked

```ts
// New — src/features/userAccess/logic/canEditEvent.ts. Pure.
export function canEditEvent(input: {
  isAdmin: boolean;
  isAccountManager: boolean;
  accountManagerZoneIds: string[];
  leadZoneIds: string[];
  userId: string | null;
  /** Events.created_by_user_uuid as loaded (originalOwnerUserUuid); null when unknown. */
  originalOwnerUserUuid: string | null;
  /** Zones of the bleachers on the event right now. */
  eventBleacherZoneIds: string[];
}): boolean;
// = (isAdmin || isAccountManager) && canEditOwnedEntity({ ...same fields, isNew: false })
// i.e. exactly the `canEdit` that EventConfigurationForm computes today.

// New — src/features/eventConfiguration/functions/saveEventPanelChange.ts
/** linked: true inserts the BleacherEvents row only if it is absent (same default columns
 *  as updateEvent used); false deletes the row for this (event, bleacher). */
export async function setEventBleacherLinked(input: {
  eventUuid: string;
  bleacherUuid: string;
  linked: boolean;
}): Promise<void>;
/** Writes Events.hsl_hue. */
export async function setEventHue(input: { eventUuid: string; hslHue: number }): Promise<void>;
```

Both write through `db` with `typedExecute` (PowerSync, local-first); the existence check
uses `typedGetAll(..., expect<{ id: string }>())`.

**Removed:** `createEvent`, `deleteEvent` (`db.ts`); `updateEvent` (file); `checkEventFormRules`;
`CurrentEventState.subrentalConstraint`; the `showDelete` prop of `EventConfigurationForm`.

**Unchanged:** `loadEventForModal` and its `target`, `useSwapStore`, `executeSwap`, every
other field of `CurrentEventState`, `BleacherCell`, `database.types.ts`, `AppSchema.ts`.

## 5. Scenarios

- **Toolbar.** An admin or account manager sees "+ Create ▾". Its menu has two items,
  Maintenance Event and Sub-Rental Request. No "New Event" anywhere. A viewer sees no
  button.
- **Cell popup.** An admin clicks an empty cell: icons for Work Tracker, Maintenance and
  Create Sub-Rental; no Create Event.
- **View an event.** Click an event on the grid, or "Open in Dashboard" on the quote card:
  the panel opens with Core / Details / Alerts, every field greyed and unchangeable, no
  Create / Update / Delete button, no yellow banner. The locate buttons work.
- **Quote.** An admin, account manager or viewer clicks Quote → `/quotes-bookings/{id}`
  (read-only card). A maintainer sees no Quote button.
- **Colour.** An admin drags the slider: the event on the grid changes colour live; on
  release it is saved. After a reload the colour is the saved one. A viewer, or an account
  manager on someone else's event, sees no palette button.
- **Bleachers.** An admin opens an event, clicks – on one of its bleachers: the bar leaves
  that row and the change is saved. Clicks + on another bleacher: the event appears there.
  Removes every bleacher: the event leaves the grid, the panel stays, + still works. Closes
  the panel: nothing is asked, nothing is lost (everything was saved).
- **Switching events.** While event A is open, the user opens event B: A's panel is
  replaced; A's bleacher changes stay saved; +/– now act on B.
- **No right.** An account manager opens an event owned by someone else: fields greyed,
  no palette, no +/–, Quote visible; Swap buttons as today (D7).
- **Swap.** Unchanged: pick two bleachers, confirm, events move.
- **Alert pop-up.** Clicking an event alert opens the pop-up over `/dashboard`: same
  read-only form, no save or delete button.
- **Unchanged.** A maintenance event, a sub-rental and a work tracker can be created,
  edited, deleted and moved as before.

## 6. Edge cases and errors

- **Offline:** the two writes are PowerSync writes, so they work offline and upload later.
  Swap writes straight to Supabase and still needs the network (unchanged).
- **Clerk / session:** no new calls beyond `triage`, which already used the Supabase
  client. If `triage` throws, the bleacher change stays saved, the error is logged, and the
  alerts catch up with the next change.
- **Quick clicks:** writes for one event run in order (a queue per event), so +/– pressed
  fast on two bleachers cannot interleave or reorder.
- **A stale panel:** the panel shows the copy loaded when it opened, as today. A link is
  written against the database, not the copy (insert only if absent, delete by pair), so a
  stale panel cannot create a duplicate `BleacherEvents` row.
- **Role or zones change while the panel is open:** `canEditEvent` is evaluated again when
  the permissions store or the event's bleachers change; the +/– and the palette appear or
  go away. A write already sent is not recalled.
- **The zone rule:** an event with a bleacher from a zone the account manager cannot
  access can be changed only by its owner (as Update was).
- **An event with no bleacher** has no cell on the bleacher rows. The panel stays open so a
  bleacher can be attached; once it is closed the event is reached from its quote card
  ("Open in Dashboard").
- **The pop-up** has no grid: colour yes (with the right), bleachers no.
- **The database is not changed.** Who may change colour and bleachers is decided in the
  interface, as Update's `canEdit` was. Row-level security stays as it is.

## 7. Tests

- **Vitest** (new unless noted):
  - `canEditEvent.test.ts`: admin any event; account manager own / not own / lead of a
    zone / inaccessible-zone bleacher (owner and not owner); viewer false; maintainer
    false; no `userId` false; empty roles false; same answer as `canEditOwnedEntity` for
    the same input.
  - `saveEventPanelChange.test.ts`, with `db` mocked the way `saveWorkTracker.test.ts`
    does: link inserts when absent and skips when present; unlink deletes the pair;
    `setEventHue` writes `hsl_hue`; an error from `db` reaches the caller.
  - `CreateEventButton.test.tsx`: viewer renders nothing; admin sees "+ Create" with exactly
    two items; no "New Event"; each item opens its own form.
  - `EventConfigurationForm.test.tsx`: no button named Create Event, Update Event, Delete
    Event or Saving; no banner; every Core and Details field disabled; locate buttons
    enabled; Quote shown for admin, account manager and viewer, hidden for a maintainer;
    Quote pushes `/quotes-bookings/{id}`; palette hidden when `canEditEvent` is false; a
    slider release writes once when the value changed and not at all when it did not; a
    failed write restores the value and shows the toast.
  - `CellEditor.test.tsx`: no Create Event button; the three others present for an admin,
    none for a viewer.
  - `permissionPageData.test.ts`: existing, must stay green.
  - The grid's +/– handler is part of a canvas renderer and is not unit-tested (none of
    the renderers is). Its rule is covered where it lives: `canEditEvent` and
    `saveEventPanelChange`.
- **Playwright** (written, **not run** — you asked me not to run e2e locally; reported as
  SKIPPED), new files `dashboardEventReadOnly.{admin,am,viewer}.spec.ts`, S10 onward:
  - S10 (admin): "+ Create" with two items, no "+ New Event".
  - S11 (admin): an opened event has no Create / Update / Delete Event; fields disabled;
    locate buttons enabled.
  - S12 (admin): Quote goes to `/quotes-bookings/{id}`, URL without `/edit`.
  - S13 (admin): drag the slider and release, then read `Events.hsl_hue` with the
    fixture's service client: it is the new value.
  - S14 (viewer): Quote visible and goes to the card; no palette; fields disabled.
  - S15 (account manager, event of another owner): Quote visible; no palette.
  - The +/– scenarios are not automated: the grid is a PixiJS canvas with no click hook.
  - Changed in `eventFormAlerts.*.spec.ts`: S3 and S9 removed (their input or button is
    gone); S7 now reads the Owner field instead of opening its dropdown (reading R9).
    `openEventForm` stays valid.
- **Definition of Done:** `npm run tc`, `npm run test`, Prettier `--check` on the touched
  files only (the repo-wide gate is red at baseline), and the final report with real output.

## 8. Deploy order

The app only. No migration, no sync rules. The two new writes use tables PowerSync already
uploads (`Events`, `BleacherEvents`), as Update did.

## 9. Not part of this change

- Maintenance events, sub-rentals, work trackers, notes in cells and damage reports.
- The quote card: `/quotes-bookings/{id}`, its Edit page `/edit`, its Delete and its "Open
  in Dashboard". Creating and editing an event stay possible there.
- Swap's rights, and the fact that it writes online-only.
- The grid's preview overlay for the open event (`Events.ts`): it still draws the live
  colour while the slider moves.
- `/old-dashboard` (its create button is already commented out); `LenientSelections.tsx`
  and `openModal` on the store, unused before this change.
- Database rules for who may write `Events.hsl_hue` or `BleacherEvents`.

## 10. Readings to confirm

- **R1.** "The window" in the author's rule (D1) is the event panel above the grid, "close"
  is its X button. Minimise (–) is not close: while minimised, +/– still works, as today.
- **R2.** `triage("Events", { id })` runs after every bleacher change; on removal it also
  passes `removed_bleacher_uuids: [that bleacher]`, as Update did. It does not run after a
  colour change.
- **R3.** No success toast per click ("Event Updated" is gone). An error toast on failure.
- **R4.** The effect that fills a missing "Booked At" with today's date existed so Update
  could save it. With no save it would only show an invented date, so it goes: a booked
  event with no stored date shows an empty field.
- **R5.** The suggested colour for an event with none (`calculateBestHue`) stays a display
  only, never saved on its own; opening the palette on such an event still starts the
  slider at 0 in the panel, saved only by a release that changes the value.
- **R6.** The palette also works in the pop-up (same form, same rule).
- **R7.** The pop-up keeps its title "Create Quote" and its footer. The Quote button inside
  it also closes the pop-up before navigating (today nothing closes it, so it would stay
  over the next page).
- **R8.** The Create Event icon in the cell popup counts as "create an event from
  `/dashboard`" (item 1) and goes.
- **R9.** Tests: S3 (changes Status) and S9 (presses Delete Event) go because their input is
  gone; S7 opens the Owner dropdown, which is disabled now, so it checks the Owner field
  shows a name instead.
- **R10.** In D5, "the same rule as Update" means the `canEdit` of today's form, including
  its requirement of admin or account manager, so a viewer or maintainer can never change.
- **R11.** For a viewer, an account manager on another's quote, and a maintainer, the
  quote card opens under the card's own rules, which this spec does not touch.

## 11. Files

Counted: 13, over the cap of 10. Cutting would split one logic ("the dashboard no longer
creates or edits events"), so they stay together.

- Changed (11): `CreateEventButton.tsx`, `EventConfigurationForm.tsx`, `tabs/CoreTab.tsx`,
  `tabs/DetailsTab.tsx`, `dashboard/components/CellEditor.tsx`,
  `dashboard/cellRenderers/StickyLeftColumnCellRenderer.ts`,
  `dashboard/ui/event/EventBody.ts`, `dashboard/db/client/db.ts`,
  `dashboard/db/client/updateEvent.ts` (deleted), `dashboard/functions.ts`,
  `eventConfiguration/state/useCurrentEventStore.ts`.
- New (2): `userAccess/logic/canEditEvent.ts`,
  `eventConfiguration/functions/saveEventPanelChange.ts`.
- Not counted: `permissionPageData.ts`, the tests and e2e files above, this spec.

## 12. What differs from the text above (found while building)

- **A third export.** `saveEventPanelChange.ts` also exports `commitEventHue({ eventUuid,
startHue, endHue })`, which returns `"saved"` or `"unchanged"` and throws when the write
  fails. It holds the rule "write only if the colour moved during the gesture", so a unit
  test can reach it; the form calls it and puts the colour back on a throw. The two locked
  functions are as written.
- **Quote is a link.** The Quote control is a Next `<Link>` (an `<a>`) with the same look, not
  a `<button>`. Its destination is then plain markup a test can read. Playwright finds it by
  role `link`.
- **Two shared components got an optional `disabled`.** `Toggle.tsx` and `LostReasonFields.tsx`
  (also used by the quote form) each take `disabled?: boolean`, default off, so the Setup /
  Teardown switches and the Lost Reason picker look and act disabled. Counted files are 15,
  not 13.
- **No `fieldset` around the tabs.** Every control in Core and Details is `disabled` on its
  own, so the locate buttons stay enabled (D10). Only the venue picker sits in a small
  disabled `fieldset`, which locks its search, create and edit buttons at once.
- **`CreateMenuItems`** is exported from `CreateEventButton.tsx` so a test can draw the menu.
- **The grid.** `StickyLeftColumnCellRenderer` keeps a `toggleShown` flag next to
  `isFormExpanded`: +/– follows it, Swap keeps following `isFormExpanded`. It refreshes on
  the three form stores and on the permissions store. One more removal beyond 3.9: the
  now-unused imports of `db.ts` and `functions.ts`.
- **Tests that could not be written as the text says.** The repository has no DOM test
  environment (no jsdom, no Testing Library): component tests render static markup, and a
  zustand store is mocked because a server render reads its initial state. So:
  - "a slider release writes once, not when unchanged; a failed write restores the colour" is
    tested on `commitEventHue` (`saveEventPanelChange.test.ts`); the pointer and key handlers
    that call it are not exercised by a test;
  - "each + Create item opens its own form" is not tested; the menu's items are;
  - "Quote pushes `/quotes-bookings/{id}`" is tested as the link's `href`.
- **Playwright S10–S15** are written and **not run** (you asked me not to run e2e). S15's
  "no palette" assumes the seeded account manager leads no zone; a lead may change any event.
- **Not seen in a browser.** The grid's +/–, the slider gesture and Swap were not driven: the
  dashboard needs a Clerk sign-in, and the grid is a canvas.
- **Results:** `tsc --noEmit` exit 0; Vitest 497 files, 6876 tests, all passed; Prettier clean
  on every touched file (`db.ts` also lost one blank line that was already out of style).
