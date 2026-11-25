# Repairs 08a: choose which damage reports to close

Status: **APPROVED and IMPLEMENTED 2026-11-24**, uncommitted (0 open decisions; D238 to D252 were
taken by the user on 2026-11-24 in four question batches; the results are in §11; the Playwright
scenarios are written and not run (D251) and the browser check is the user's). An amendment to spec 08, built on 09a, 09b2 and 11, so its
build order is "after 11". Needs: [repairs-03-list-query.md](repairs-03-list-query.md),
[repairs-08-status.md](repairs-08-status.md), [repairs-09a-repair-writes.md](repairs-09a-repair-writes.md),
[repairs-09b1-services.md](repairs-09b1-services.md),
[repairs-09b2-bleachers-zone-reports.md](repairs-09b2-bleachers-zone-reports.md) and
[repairs-11-dashboard.md](repairs-11-dashboard.md) (all implemented; this spec reads the working
tree of 2026-11-24, branch `q4-sprint4-maintenance`, HEAD f52ddffa). Plan:
[repairs-plan.md](repairs-plan.md).
Scope: **when a repair moves into Completed, the damage reports are no longer closed on their own.
A dialog asks which of the open reports linked to the repair to close, one switch per report. The
same dialog appears where a write used to close reports of a Completed repair without asking: New
repair saved as Completed, and a service that puts a bleacher on a Completed repair. It changes
D115 and D116 of spec 08, D135 of 09a, D181 and D185 of 09b2; §3 lists every clause, and the
"Approved" of this spec approves them.** No migration, no sync change, no change to the list query,
to `useRepairList`, to the Reported column or to the locked types of spec 03.

## 0. The request, and what it touches

**The request (user, 2026-11-24, translated).** "When the user moves `MaintenanceEvents.status` to
completed, ask them which of the open linked reports to set `resolved_at` to the date." So the
silent closing of spec 08 D116 becomes a choice made by the person.

**The feature in brief.** The Repairs page replaces the "Maintenance Log" tab of Sam's spreadsheet.
A row is one repair (one invoice); its services are rows of `MaintenanceLineItems`; its bleachers
are the junction `BleacherMaintEvents`, kept equal to the bleachers of its live services. An
administrator and a maintainer write; every other role reads. Specs 01 to 11 built the page and the
Dashboard windows. Every decision in this series is the user's, and a spec holds no "readings to
confirm". The English spec lives in the repository; a full Ukrainian copy is a private artifact.

**Earlier decisions this spec relies on or changes** (the number, then what it says now).

- **D112, D113 (spec 08):** into Completed `completed_at` gets the moment of the write; out of
  Completed it is cleared. Both hold. D112's "moment of the click" reads as "the moment of the write"
  (D239).
- **D115 (spec 08):** no confirmation. It holds for every case except a move into Completed that has
  at least one candidate report (D249); there the dialog is the confirmation.
- **D116 (spec 08):** the reports found for the repair (the Reported list) that are still open are
  closed in the same write. Replaced by D238, D240, D243 and D244.
- **D117, D118, D119 (spec 08):** leaving Completed leaves the reports closed; a deleted repair has
  no menu; a failed local write is a red toast. All hold.
- **D135 (spec 09a):** the Edit Status select uses the rules of the menu. It still does, with the
  dialog after Save (D247). "New + Completed closes no report" was already replaced by 09b2.
- **D144 (spec 09a), D183 (09b2):** Delete and Restore do not touch reports. Hold.
- **D178, D179, D182, D184 (spec 09b2):** a service links the open reports of a bleacher at the
  moment the bleacher gets its first live service; a report linked to another repair is skipped;
  statements run in the order repair, services, junction, zone, reports. All hold for a repair that
  is not Completed. For a Completed repair see D245 and D246.
- **D181, D185 (spec 09b2):** on a Completed repair the reports are linked and closed at once, only
  those created no later than `event_end`. The narrowing by `event_end` stays as the rule of which
  reports are offered; the closing at once is replaced by the dialog (D245, D246).
- **D26 to D28 (spec 03):** the Reported list. Unchanged; it is no longer used to close reports.
- **D230, D234 (spec 11):** a report made into a repair stays open and linked until the repair is
  Completed. Unchanged; the person now chooses at that moment.

**Decisions of this spec (user, 2026-11-24; four question batches).**

- **D238 (what changes):** a move into Completed does not close reports by itself. A dialog asks,
  and the person decides report by report. The rest of the status write is as in spec 08.
- **D239 (the moment):** `completed_at` and the `resolved_at` of every closed report are the same
  clock reading, taken when Confirm is clicked. Where no dialog is drawn (D249) it is taken at the
  click of the menu entry or of Save, as before.
- **D240 (which reports, the status path):** the open reports linked to this repair:
  `maintenance_event_uuid` is the repair, `resolved_at` is empty, `deleted` is 0, any bleacher, any
  category. A report found only by category (spec 03 D26) is not offered and is no longer closed by a
  status change; `DamageReportCategories` is empty today, so no report is affected yet.
- **D241 (the row):** each report is a row with a switch ("Close" or "Keep open") and the medium
  content: the bleacher number, the Reported day, who created it, the Seat and Haul levels and the
  note. No photos and no categories.
- **D242 (the start):** every switch is on when the dialog opens.
- **D243 (Cancel and Confirm):** Cancel, Esc and a click outside write nothing; the status stays; in
  an Edit, New repair or service window the window stays open with its draft. Confirm writes the
  whole change. Confirm with every switch off writes Completed and closes no report. There is no
  "Skip" button.
- **D244 (a switch off, a linked report):** the report stays open and its link is cleared
  (`maintenance_event_uuid` becomes empty). It leaves the Reported list of this repair, stays on the
  drivers' phones, and can be taken by another repair or offered again by D246.
- **D245 (New repair saved as Completed):** after Save, once the form is valid, a dialog lists the
  open reports of the bleachers of the draft's live services that are linked to no repair (09b2
  D179) and were created no later than Repair to (09b2 D185). On: linked and closed in the write.
  Off: left open and unlinked.
- **D246 (a service on a Completed repair):** when a Save of a service (Add service, or a changed
  bleacher) gives a bleacher its first live service on a Completed repair (09b2 D182), a dialog after
  Save lists that bleacher's open unlinked reports created no later than Repair to. On: linked and
  closed. Off: left open and unlinked. A second service on a bleacher, an edit of an amount, the
  category, the severity or the description, and Delete of a service raise no dialog.
- **D247 (Edit, the Status select):** the dialog comes after Save is pressed and the form is valid
  (the errors under the fields come first), not when Completed is picked in the select. Cancel leaves
  the window in Edit with its draft.
- **D248 (one dialog):** when one Save both moves the repair into Completed and gives a bleacher its
  first service, there is one dialog with two sections ("Linked to this repair" from D240 and "Open
  reports of the added bleachers" from D246), one Confirm and one transaction. A heading is drawn
  only when both sections exist.
- **D249 (leaving Completed, and no candidates):** leaving Completed or moving between two other
  statuses raises no dialog; `completed_at` is cleared on the way out and closed reports stay closed
  (D113, D115, D117 unchanged). When the list of candidates is empty there is no dialog and the
  change is written at once.
- **D250 (the window):** the shadcn `Dialog`, scrolling, with Cancel and Confirm, on the layer
  `REPAIR_LAYER_CLASS` (`z-[1150]`), so it lies over the repair windows and over the damage report
  card.
- **D251 (Playwright):** S37 is rewritten for the dialog and S58 to S62 are added. Written, not run.
  This replaces spec 08 D122 (no scenarios) for this area.
- **D252 (the matrix):** `permissionPageData.ts` and its test change in the same commit; the levels
  do not change, four sentences do (§5).

**What follows from the request and the answers (no new decision).** Each item names its source. The
last item is wording and looks only; it is listed so it can be corrected.

- **Who sees the dialog** (D110, 09a D124): only an administrator and a maintainer, the roles that
  have the menu and the writers. Nobody else is asked anything.
- **When the candidates are read** (§2.3): once, from the local database, when the person acts. The
  list does not change while the dialog is open. A report that has not reached the device is not
  listed. The writes keep their guards, so a report closed or linked by someone else meanwhile is not
  touched.
- **The status is not written before Confirm:** until then the pill shows the old status.
- **A closed report** keeps its link and gets `resolved_at` only; it leaves the drivers' phones (the
  mobile sync carries only open reports, spec 08 §1). An open one stays on them.
- **The Dashboard** (09b2 §0): the strip of an open report follows the repair it is linked to; a
  report unlinked by D244 goes back to the strip of an unlinked report; a closed one has no strip.
- **Wording and looks I chose:** the title "Close damage reports?", the description "Choose which of
  the open damage reports to close.", the labels "Close" and "Keep open", the headings of D248, a
  `role="switch"` button drawn by hand (no Radix switch package is installed, and the project pins
  one copy of Radix, see commit 00aa170b), the button text "Confirm", a note clamped to three lines,
  and the test ids.

## 1. What the code has today (researched 2026-11-24)

Every path where a repair becomes Completed or a report is closed:

- **The row menu.** `RepairsTable.tsx:240` draws `RepairStatusMenu`; `RepairsPage.tsx:165` passes
  `startStatusChange` (`RepairWindowsHost.tsx:30`), which calls `changeRepairStatus`
  (`repairStatusWrite.ts:64`). `buildStatusStatements` (`repairStatusWrite.ts:29`) writes the repair
  and, into Completed, updates `DamageReports` for `repair.reported` with `resolved_at IS NULL`
  (lines 44 to 54). `reportIdsToClose` (`repairStatus.ts:43`) chooses the ids.
- **The repair window menu.** `RepairWindowsHost.tsx:219` calls the same `startStatusChange`.
- **The Edit Status select.** `RepairForm.tsx:146`; Save calls `onSave` (`RepairWindowsHost.tsx:117`),
  then `updateRepair` (`repairWrite.ts:273`), which calls `buildStatusStatements` when the status
  changed (`repairWrite.ts:129` to 139). When services changed too, the batch goes through
  `writeRepairChanges` (`repairWrite.ts:295`).
- **New repair as Completed.** `repairWrite.ts:67` writes `completed_at = now`. Reports are closed by
  the 09b2 plan, not by spec 08: `planRepairLinks` (`repairLinks.ts:188` to 197) fills
  `closeReportIds`, and `buildLinkStatements` (`repairLinkWrite.ts:223` to 233) writes them.
- **A service on a Completed repair.** The same `closeReportIds` path, reached through
  `createService` and `updateService` (`serviceWrite.ts:203`, 225) and `writeRepairChanges`
  (`repairLinkWrite.ts:348`). Nobody is asked.
- **The Dashboard** (spec 11): "Create Maintenance to Resolve" and the wrench of a cell open the New
  repair window; the report is linked by 09b2 and stays open (D230). It is closed by the first three
  paths.
- **Not paths:** Delete and Restore (`repairWrite.ts:307` to 335, D144); "Mark resolved" on the
  Damage Reports page (`fixedMark.ts`), which closes by hand; no database trigger closes a report
  (spec 08 §1).
- **The windows.** `RepairWindow.tsx` and `ServiceWindow.tsx` run `submit` inside a `try` whose
  `catch` leaves the window as it is (`RepairWindow.tsx:652`, `ServiceWindow.tsx:414`); that is how
  Cancel of the dialog will stop a save without a signature change.
- **Data.** `DamageReportCategories` has 0 rows, so the Reported list is found by the link alone.
  `DamageReports` has `resolved_at`, `maintenance_event_uuid` and `deleted`. The project has
  `@radix-ui/react-checkbox` and no switch package.
- **The matrix** says in four places that a report is closed when the repair is Completed (§5).

## 2. The behaviour

### 2.1 Where the dialog is asked, and what it lists

- **A status menu entry** (row or repair window) into Completed, from another status: the open
  reports linked to the repair (D240).
- **Save of an Edit** with the Status select on Completed while the repair is not Completed: the
  same list. With a service that gives a bleacher its first live service and a repair that is
  Completed after the Save: also the open unlinked reports of that bleacher created no later than
  Repair to (D246), in their own section (D248).
- **Add repair** with the status Completed and at least one live service: the unlinked open reports
  of the bleachers of those services, created no later than Repair to (D245).
- **Save of a service** (Add service in an open row, in the repair window, in the Edit draft's
  service window, or Edit of a service with another bleacher) on a repair that is Completed (D246).
- **Never:** a move out of Completed, a move between two other statuses, Delete, Restore, the
  service window's pill (D111), a repair with no candidate (D249).

### 2.2 The dialog

- Title and description (wording of §0). One row per report, earliest first, grouped in at most two
  sections (D248). A row: a switch at its left (on = close), then the bleacher chip, "Reported
  2026-11-10 by First Last", "Seat: minor, Haul: none" and the note (D241).
- Buttons: Cancel and Confirm (D243). Esc and a click outside are Cancel. The list scrolls; the
  buttons stay in view.
- It is the shadcn `Dialog` on `REPAIR_LAYER_CLASS` (D250), opened over whatever window asked.

### 2.3 The flow

1. The person acts (a menu entry, Save of a form, Save of a service).
2. A form is validated first; errors show under the fields and no dialog is drawn (D247).
3. `readCloseCandidates` reads the candidates from the local database (§3): the linked open reports
   when `asksOnStatusChange` is true, and the free reports of the gained bleachers when the status
   after the write is Completed.
4. No candidate: the write runs at once with an empty choice (D249).
5. Otherwise the dialog opens. Confirm: the clock is read, the choice carries that moment as
   `confirmedAt`, and one local write carries the change and the choice. Cancel: the flow throws `CloseChoiceCancelled`; nothing is written, and the existing
   `catch` of the window leaves it as it is.
6. A zone refusal (09b2 D176, D186) is found inside the write, after Confirm: the red line shows,
   nothing is written, the window stays in Edit, and the next Save asks again.

### 2.4 What is written

- **The status path** (`buildStatusStatements`), into Completed: the repair statement as today
  (`status`, `completed_at = now`); then, when `closeLinkedIds` is not empty, one update of
  `DamageReports` setting `resolved_at = now` for those ids with `maintenance_event_uuid` equal to the
  repair and `resolved_at IS NULL`; then, when `unlinkLinkedIds` is not empty, one update setting
  `maintenance_event_uuid` to empty for those ids with the same two guards. Out of Completed or
  between two statuses: only the repair statement, and the two lists are ignored.
- **The 09b2 plan** (`planRepairLinks`): `closeReportIds` is the free reports of the gained bleachers
  created no later than `eventEnd` whose id is in `closeFreeIds`, and only when the repair is
  Completed after the action's own statements. Nothing else of the plan changes: a repair that is
  not Completed still links every free report of a gained bleacher (09b2 D178). The statement keeps
  its guards (`resolved_at IS NULL`, no link).
- **Order** (09b2 D184): the repair, its services, the junction, the zone, then the reports. The two
  status statements on `DamageReports` come right after the repair statement, as today.
- **Not written:** `event_start`, `event_end`, `cost_cents`, any report that is not in the choice,
  and any report when the dialog was Cancelled.

## 3. Types and signatures (locked; changing them needs a new "Approved")

`src/features/repairs/utils/closeReports.ts` (new, pure):

```ts
import type { OpenReportForLink } from "./repairLinks";
import type { DamageLevel } from "./repairDetails";

export type CloseGroup = "linked" | "free"; // D240 | D245, D246

export type CloseCandidate = {
  id: string;
  group: CloseGroup;
  bleacherNumber: number | null;
  day: string; // the Reported day, YYYY-MM-DD in the app time zone
  createdBy: string | null; // "First Last"
  seat: DamageLevel;
  haul: DamageLevel;
  note: string | null;
};

/** What the person chose; ids of one group never appear in the list of the other. */
export type CloseChoice = {
  closeLinkedIds: string[]; // D240, switch on
  unlinkLinkedIds: string[]; // D244, switch off
  closeFreeIds: string[]; // D245, D246, switch on
  /** The moment of the Confirm click (D239); absent when nobody was asked (the writer's `now` stands). */
  confirmedAt?: string;
};
export const NO_CLOSING: CloseChoice;

/** True only when `to` is "completed" and `from` is not (D249). `from` is any stored word. */
export function asksOnStatusChange(from: string, to: string): boolean;

/**
 * The free reports a Completed repair may close (09b2 D179, D185): open, linked to no repair, on a
 * gained bleacher, created no later than `eventEnd` (a day in `timezone`). Empty when `eventEnd` is
 * null. Shared by the dialog and by `planRepairLinks`.
 */
export function offeredFreeReports(input: {
  openReports: readonly OpenReportForLink[];
  gained: readonly string[];
  eventEnd: string | null;
  timezone: string;
}): OpenReportForLink[];

/** The bleachers of the live services of a repair, one per service, in the list's order. */
export function liveServiceBleachers(repair: {
  services: readonly { bleacherUuid: string; deleted: boolean }[];
}): string[];

/** One occurrence of `removed` leaves the list and `added` joins it (a service changes bleacher). */
export function bleachersAfterServiceChange(
  before: readonly string[],
  change: { removed: string | null; added: string | null },
): string[];

export function initialSwitches(candidates: readonly CloseCandidate[]): Record<string, boolean>; // all on (D242)
export function choiceFromSwitches(
  candidates: readonly CloseCandidate[],
  switches: Readonly<Record<string, boolean>>,
): CloseChoice; // linked on = close, linked off = unlink, free on = close, free off = nothing
export function closeSections(candidates: readonly CloseCandidate[]): {
  linked: CloseCandidate[];
  free: CloseCandidate[];
}; // each earliest first by `day`, then `id`
```

`src/features/repairs/db/closeCandidatesRead.ts` (new):

```ts
import type { CompiledQuery } from "kysely";

export type RawCloseCandidateRow = {
  id: string;
  bleacherUuid: string | null;
  bleacherNumber: number | null;
  createdAt: string | null;
  repairId: string | null;
  seatDamage: string | null;
  haulDamage: string | null;
  isSafeToSit: number | null;
  isSafeToHaul: number | null;
  note: string | null;
  creatorFirstName: string | null;
  creatorLastName: string | null;
};

/** Open (`resolved_at` empty), not deleted reports with `maintenance_event_uuid` = the repair. */
export function buildLinkedOpenReportsQuery(repairId: string): CompiledQuery<RawCloseCandidateRow>;
/** Open, not deleted reports of these bleachers, with the same columns. */
export function buildBleacherOpenReportsQuery(
  bleacherUuids: readonly string[],
): CompiledQuery<RawCloseCandidateRow>;

export type CloseCandidatesInput = {
  repairId: string | null; // null: a New repair
  fromStatus: string | null; // the status the list shows now; null for a New repair
  toStatus: string; // the status after the write
  eventEnd: string | null; // Repair to after the write
  bleachersBefore: readonly string[]; // one per live service now; empty for a New repair
  bleachersAfter: readonly string[]; // one per live service after the write; empty when no service is written
  timezone: string;
};

/** Two local reads at most (`typedGetAll`); an empty list when nobody is asked. */
export function readCloseCandidates(input: CloseCandidatesInput): Promise<CloseCandidate[]>;
```

`src/features/repairs/components/CloseReportsDialog.tsx` (new):

```ts
export type CloseReportsDialogContentProps = {
  candidates: readonly CloseCandidate[];
  switches: Readonly<Record<string, boolean>>;
  onToggle: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  /** The dialog passes its own title and description (Radix needs them inside its context). */
  Title?: ElementType;
  Description?: ElementType;
};
/** The inside of the dialog, exported so that it is tested without a portal. */
export function CloseReportsDialogContent(props: CloseReportsDialogContentProps): JSX.Element;
export function CloseReportsDialog(props: {
  candidates: readonly CloseCandidate[];
  onCancel: () => void;
  onConfirm: (choice: CloseChoice) => void;
}): JSX.Element; // always open; the hook mounts it only while it asks
```

`src/features/repairs/hooks/useCloseReportsFlow.tsx` (new):

```ts
export class CloseChoiceCancelled extends Error {}

export function useCloseReportsFlow(): {
  /** The menu entry of a row or of the repair window (spec 08). Never rejects; shows its own toast. */
  changeStatus: (repair: RepairListRow, to: RepairStatus) => void;
  /** For a writer: reads, asks if needed, resolves the choice, rejects `CloseChoiceCancelled` on Cancel. */
  chooseClosing: (input: Omit<CloseCandidatesInput, "timezone">) => Promise<CloseChoice>;
  /** Mount it once where the hook is used; null while nothing is asked. */
  dialog: JSX.Element | null;
};
```

Changed signatures (each is the old rule, then what it becomes):

- **`StatusChange`** (`repairStatusWrite.ts`): `reported` is removed; `closeLinkedIds` and
  `unlinkLinkedIds` (`readonly string[]`) are added. `buildStatusStatements` follows §2.4.
  `reportIdsToClose` is deleted from `repairStatus.ts`; `statusPatch`, `canChangeRepairStatus`,
  `statusMenuEntries` and `REPAIR_STATUSES` stay.
- **`buildUpdateRepairStatements`** (`repairWrite.ts`) gets a second parameter, `closing: CloseChoice`
  (the choice, `NO_CLOSING` by default), which it hands to `buildStatusStatements`.
- **The moment of the write** (D239): `createRepair`, `updateRepair`, `createService` and
  `updateService` use `closing.confirmedAt` when the choice carries it, and their own `now` otherwise,
  for `completed_at`, `resolved_at`, `created_at` and the other moments of the write.
- **`UpdateRepairInput`** (`repairWrite.ts`): `reported` is removed and an optional
  `chooseClosing` of type `() => Promise<CloseChoice>` is added. `updateRepair` calls it after
  validation and the duplicate check, before any write, and only when there is something to write.
  **`CreateRepairInput`** gets the same optional `chooseClosing`.
- **`CreateServiceInput`, `UpdateServiceInput`** (`serviceWrite.ts`): the same optional
  `chooseClosing`, called after validation and, in `updateService`, only on the branch that changes the
  bleacher.
- **`WriteRepairChangesInput`** (`repairLinkWrite.ts`): `closeFreeIds?: readonly string[]` (none by
  default). **`LinkPlanInput`** (`repairLinks.ts`): `closeFreeIds: readonly string[]`. `planRepairLinks`
  uses `offeredFreeReports` and keeps only the ids in `closeFreeIds`.
- **`RepairWindowsHost.tsx`:** `startStatusChange` is removed; the host and `RepairsPage` each call
  `useCloseReportsFlow` once and draw its `dialog`; the writers' `chooseClosing` come from the same
  hook.
- **The windows** (`RepairWindow.tsx`, `ServiceWindow.tsx`) do not change.

## 4. Files

**New (counted, 4):** `utils/closeReports.ts`, `db/closeCandidatesRead.ts`,
`components/CloseReportsDialog.tsx`, `hooks/useCloseReportsFlow.tsx`, all in `src/features/repairs`.

**Changed (counted, 8):** `utils/repairStatus.ts`, `utils/repairLinks.ts`, `db/repairStatusWrite.ts`,
`db/repairWrite.ts`, `db/serviceWrite.ts`, `db/repairLinkWrite.ts`, `components/RepairWindowsHost.tsx`,
`components/RepairsPage.tsx`.

**Changed, not counted:** `src/features/userAccess/permissionPageData.ts` and its test (§5);
`e2e/repairsLinks.admin.spec.ts`, `e2e/helpers/linksFlow.ts`, `e2e/helpers/repairsFixtures.ts` and a new
`e2e/repairsClose.admin.spec.ts` (§6).

**Tests (not counted):** `utils/closeReports.test.ts`, `db/closeCandidatesRead.test.ts`,
`components/CloseReportsDialog.test.tsx` (new); `repairStatus.test.ts`, `repairLinks.test.ts`,
`repairStatusWrite.test.ts`, `repairWrite.test.ts`, `serviceWrite.test.ts`, `repairLinkWrite.test.ts`,
`permissionPageData.test.ts` (changed). **12 counted files**, over the cap of 10; it is one logic
(who closes a report when a repair is Completed), so it is not cut. No migration, no
`database.types.ts`, no `AppSchema.ts`, no sync rule, no new package.

## 5. The permissions matrix (`permissionPageData.ts`, same commit)

No role gains or loses a right: the administrator and the maintainer already write, and the account
manager and the viewer already only read. The levels do not change (D252). Four sentences say that
reports are closed by themselves; each becomes a sentence about the choice.

- **"Repairs & Maintenance", description:** "...; on a Completed repair it links and closes the ones
  reported before the repair ended." becomes "...; on a Completed repair the person is asked which of
  the ones reported before the repair ended to close, and the ones not chosen stay open and unlinked."
- **"Repair Costs & Vendors", description:** "Moving a repair into Completed records the moment it was
  completed and closes the damage reports found for it, which then leave the drivers' phones; moving
  it out of Completed clears that moment and leaves the reports closed." becomes "Moving a repair into
  Completed records the moment it was completed and asks which of the open damage reports linked to
  the repair to close; the closed ones leave the drivers' phones, and the ones not chosen stay open
  and are unlinked from the repair; moving it out of Completed clears that moment and leaves the
  reports closed." Its last sentence, "...a Completed repair closes the damage reports of its bleachers
  that were reported before it ended." becomes "...when a service puts a bleacher on a Completed
  repair, the person is asked which of the bleacher's open damage reports, reported before the repair
  ended, to close."
- **"Damage Reports", the notes of the administrator and of the maintainer:** "...the report closes
  when the repair is Completed." becomes "...when the repair is Completed the person is asked whether
  to close the report."

`permissionPageData.test.ts` gets a case for each of the four sentences.

## 6. Behaviour scenarios (Playwright, written, not run)

The project rule is that Playwright is not run here (D251). Fixtures add an open repair with two open
reports linked to it, and `linksFlow.ts` gets helpers for the dialog (read the rows, set a switch,
Confirm, Cancel).

- **S37 (rewritten):** a service on a Completed repair opens the dialog with the report created
  before the end of the repair and not the later one; Confirm with the switch on links and closes it;
  the later report stays open and unlinked.
- **S58:** the status menu of an open repair with two linked open reports, Completed: the dialog lists
  both with the switches on; one is turned off, Confirm; the repair is Completed, one report has
  `resolved_at` equal to `completed_at`, the other is open and its link is empty.
- **S59:** Cancel in the dialog writes nothing: the status, `completed_at` and both reports are as
  before.
- **S60:** a repair with no open linked report goes to Completed with no dialog; moving it back out of
  Completed raises no dialog either.
- **S61:** Edit, Status Completed, a validation error first (no dialog), then Save: the dialog comes
  after Save; Confirm closes the report.
- **S62:** New repair as Completed with a service on a bleacher that has an old open report: the dialog
  lists it; Confirm links and closes it.

## 7. Tests (Vitest, written first, seen red before the code)

All run in the node environment. The project has no `renderHook`, so the hook is covered through the
pure functions and the writers it calls.

- **`utils/closeReports.test.ts`:** `asksOnStatusChange` for the 36 ordered pairs of the six statuses
  and an unknown word; `offeredFreeReports` (a linked report is skipped, a report later than
  `eventEnd` is skipped, a report on a bleacher that is not gained is skipped, a null `eventEnd` gives
  none, the day is read in the time zone); `bleachersAfterServiceChange`; `initialSwitches` all on;
  `choiceFromSwitches` for each group and each position; `closeSections` order.
- **`db/closeCandidatesRead.test.ts`** (SQLite harness of `repairLinkWrite.test.ts`): the linked query
  returns only open, not deleted reports linked to that repair; the bleacher query returns open
  reports of those bleachers; `readCloseCandidates` returns the linked group only for a move into
  Completed, the free group only for a Completed repair with a gained bleacher, both for a Save that
  does both, none for a New repair as Inbound, and none for a move out of Completed; names, levels and
  the note are mapped.
- **`db/repairStatusWrite.test.ts` (rewritten):** into Completed with both lists the repair statement,
  the closing statement and the unlinking statement, in this order, each with its guards; an empty list
  gives no statement; out of Completed and between two statuses ignore the lists; run on SQLite: a
  report in `closeLinkedIds` gets `resolved_at` equal to `now` and keeps its link, a report in
  `unlinkLinkedIds` stays open with an empty link, a report in neither is untouched, a report already
  closed or linked to another repair is untouched, no other column or row changes; `changeRepairStatus`
  still shows one red toast and rethrows on a failed write.
- **`repairLinks.test.ts`, `repairLinkWrite.test.ts`:** a Completed repair closes exactly the offered
  free reports whose ids are chosen; an empty choice closes none; a repair that is not Completed links
  as before.
- **`repairWrite.test.ts`, `serviceWrite.test.ts`:** `chooseClosing` is called after validation and
  after the duplicate check and not at all when there is nothing to write, its choice reaches the
  statements, and a rejection of it writes nothing.
- **`components/CloseReportsDialog.test.tsx`** (`renderToStaticMarkup` of the content): rows, switches
  with `role="switch"` and `aria-checked`, the headings only with two sections, the buttons, the note
  clamp.
- **`permissionPageData.test.ts`:** the four sentences.
- **A mutation check** (the habit of specs 03 to 11): three rules are broken and the tests must fail:
  (1) a switch that is off still closes its report; (2) the unlinking loses its guard
  `maintenance_event_uuid` equal to the repair; (3) the plan closes free reports that are not chosen.
  The files are restored by their hash afterwards.

## 8. Edge cases and errors

- **Clerk and auth:** the reads and the write are local and make no network call, so a Clerk error
  does not reach them. The role comes from `useTeamPermissions`; while it is not known no menu or
  window writer exists, so no dialog.
- **Offline** (spec 08 D120): the same. Until the connection is back the other people and the phones
  see the old state.
- **The server refuses** (a role that changed): the connector's general toast shows and the whole
  transaction is discarded; the reports return to their old state at the next sync.
- **Two people at once:** a report closed, linked elsewhere or unlinked by someone else after the list
  was read is not touched (the guards); the two writes end in whichever upload comes last.
- **The dialog is open and the data changes:** the list is fixed at the moment it was read.
- **A very quick second action** while the dialog is open: ignored; one dialog at a time.
- **A deleted repair:** no menu, no Edit, no dialog (D118).
- **Reports linked to a deleted repair** (09b2 D183): unchanged; they are not offered anywhere.
- **The menu and the dialog (unseen):** the status menu is a Radix modal `DropdownMenu` and the dialog
  opens right after it closes. A modal menu that opens a dialog froze the page once (commit
  4ddb03d4), and the menu packages still run on their own copies of the dismissable layer (commit
  00aa170b only joined the dialog and alert dialog). The flow opens the dialog after the local read
  has finished and the menu has closed; nobody has seen this in a browser, and the first thing to look
  at is that the page stays clickable after Confirm and after Cancel.
- **The width:** the longest note is clamped to three lines; nobody has seen the dialog in a browser.

## 9. Not in this spec

- **Reports found only by category** (spec 03 D26) are not offered and not closed. They matter once
  the driver app writes `DamageReportCategories`; such a report would stay in Reported of a Completed
  repair while open. A later decision.
- Reopening closed reports when a repair leaves Completed (D249), photos or categories in the dialog,
  a "close all" or "skip" control, a dialog for Delete or Restore, the Dashboard cell editor, the
  mobile app, a server trigger, and a browser check by Claude (the Browser pane cannot run PowerSync).

## 10. Definition of done

- `npm run tc` and `npx vitest run`, each with the real output and the exit code (Node 24 first in
  `PATH`).
- `npx prettier --check` on the files this spec touches only (the repo-wide `npm run lint` is red at
  baseline); the spec's Markdown is also checked for an inline code span that breaks a line.
- Playwright: S37 rewritten and S58 to S62 written, **not run** (D251); the report says so.
- The matrix sentences of §5 are edited in the same commit, with their test.
- After "Approved" the older specs get one line each that says they were amended by this spec: spec 08
  (D115, D116, §2.3, §3, §5), 09a (D135), 09b2 (D181, D185, and the "status that counts" paragraph), 11
  (D230 gains a pointer). The Ukrainian artifact is updated with the status and §11.
- The final report with real output: TS compilation, Vitest, E2E (written, not run).

## 11. Result (2026-11-24)

- **Done as specified.** A move into Completed no longer closes reports by itself; a dialog asks, with
  one switch per open report linked to the repair, from the row menu, the repair window menu, the Edit
  Status select (after Save) and New repair as Completed; the same dialog asks for the free reports of
  a bleacher that gets its first service on a Completed repair; one dialog with two sections when a
  Save does both. 12 counted files (4 new, 8 changed), the matrix and the tests; no migration, no sync
  change, no new package.
- **Tests first.** Written before the code and seen red: 9 test files failed (the new
  `closeReports`, `closeCandidatesRead` and `CloseReportsDialog` tests could not import their module, and
  the status writer, the writers, the plan, the link runner and the matrix failed on the new cases),
  20 tests failed and 988 passed in the 43 files that were run. After the code the same 43 files were
  green: 1124 tests. The matrix sentences were edited together with their test, so that file was not
  red first.
- **Checks (real output, Node 24 first in `PATH`).**
  - `npm run tc`: exit 0 (`tsc --noEmit`, no output after the command line).
  - `npx vitest run`: exit 0, Test Files 598 passed (598), Tests 9043 passed (9043); before this spec
    the series stood at 595 files and 8977 tests, so +3 files and +66 tests.
  - `npx prettier --check` on the touched code, test and e2e files: all matched files use Prettier code
    style (the repo-wide `npm run lint` is red at baseline).
  - Mutation check: three rules broken on purpose and the tests failed each time, 3, 4 and 4 tests (a
    switch that is off still closes; the unlinking loses its guard on the link to the repair; the plan
    closes free reports that were not chosen); the files were restored and their hashes compared.
  - Playwright: S37 rewritten and S58 to S62 written by an agent, **not run** (D251). The browser check
    was **not done** (the Browser pane cannot run PowerSync); the user checks the pages.
- **Extras and differences against the text above.**
  - `CloseChoice` has an optional `confirmedAt`: the moment of the Confirm click travels with the choice
    and the writers use it for the whole write (D239). It is in §3 above.
  - `liveServiceBleachers` (in `closeReports.ts`), the optional `Title` and `Description` props of the
    dialog's content, and the second parameter `closing` of `buildUpdateRepairStatements` are in §3.
  - The statement that closes a linked report sets only `resolved_at` (the link is already there); the
    statement that unlinks a kept one sets only `maintenance_event_uuid` to empty. Both carry the guards
    `resolved_at IS NULL` and the link to this repair.
  - `useCloseReportsFlow` shows its own red toast "Failed to change the status." when the local read of
    the candidates fails, lets one question run at a time (a second action meanwhile is ignored), and
    waits one macrotask before it opens the dialog, so that the status menu has closed.
  - `repairLayer.test.ts` counts eleven dialogs of the feature instead of ten.
  - The e2e agent added helpers (`chooseRowStatus`, `chooseFormStatus`, the dialog helpers) and a `close`
    fixture of five fresh bleachers; the Status select of the forms has no id, so the helper finds it by
    its label.
- **What nobody has seen:** the dialog in a browser (its height, the switch, the layer over the repair
  window and over the damage report card); the status menu closing and the dialog opening after it
  (§8, the first thing to look at: the page stays clickable after Confirm and after Cancel); Cancel in
  the Edit, New repair and service windows leaving them open with their draft; the first write of the
  chosen closing on real data and the server accepting it; the e2e scenarios.
- **Not done.** Nothing is committed. The Ukrainian artifact is updated with this section. `seed.sql` and
  `supabase/.temp/cli-latest` are not mine and stay out of every commit.
