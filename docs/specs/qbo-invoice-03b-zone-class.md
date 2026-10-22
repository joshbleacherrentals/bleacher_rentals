# QuickBooks invoice — the zone as the QuickBooks Class

Status: **DRAFT 2026-10-22, rewritten 2026-10-22 after the user's answers — awaiting
"Approved".** 0 open decisions; two readings to confirm (§1, last paragraph).
Implementation order: **03b**, after [03a](qbo-invoice-03a-province-tax-codes.md) and before
[04](qbo-invoice-04-create.md). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.
Builds on: [03](qbo-invoice-03-payload.md) (the builder places a `classId` it is given).

## 0. The request, and what it is not

The QuickBooks invoice line has a **Class**: the quote's zone. The app's zones and
QuickBooks' classes are already connected, so this spec only **finds** the Class of a quote;
the builder of spec 03 puts it on the line.

**Not part of this spec:** the connection of zones to classes (it exists and is maintained
elsewhere); the line itself (spec 03); creating or editing zones or classes.

## 1. Decisions (all taken by the user)

**Question — a quote whose state is in no zone, or whose zone has no Class for the office's
QuickBooks connection**

- **Option A — refuse the invoice** with a message naming the state and the connection.
- **Option B — create the invoice without a Class** and say so in the result.
- **User's answer: B — create without a Class.**

**From the user's own words (not options):**

- The mapping is the table `ZoneQboClasses`: `zone_uuid` is the zone in the app,
  `qbo_connection_uuid` is the QuickBooks company (Canada or USA), `qbo_class_id` is the
  zone's id (the class) in QuickBooks.
- **The USA company has five classes** (the one labelled "CAN" there means the states next
  to Canada). **The Canadian company has effectively one general class.** Both are already
  covered by the table's rows; the app has six zones.

**Readings to confirm at review.**

- The state that decides the zone is the **venue's state** (`Events.address_uuid`), the
  same state the invoice's Location of Sale carries, found with the app's own
  `zoneOfEvent` rule. The website-form state fallback in that rule is not needed here,
  because spec 03 refuses a quote with no venue state.
- A Canadian province is in a zone like any other state, and the Canadian company's row for
  that zone points at its one class; so no Canada-specific code is needed.

## 2. Research findings

- **The tables.** `ZoneQboClasses` has one row per zone and connection
  (`unique (zone_uuid, qbo_connection_uuid)`). `ZoneStateProvinces` lists the states and
  provinces of each zone; a state belongs to one zone only.
- **The rule that finds a zone.** `zoneOfEvent(event, zoneByState)` in
  `quotesAndBookings/utils/zoneOfEvent.ts` reads the event's state, normalises it
  (`normalizeStateProvince`: trimmed, lowercase, one spelling of D.C.) and looks it up in a map
  from `buildZoneByState(rows)`. It returns null for a missing state or a state in no zone.
  Those three functions are pure, so server code can use them.
- **The precedent.** `create-bill` turns a destination state into a class the same way
  (state → zone → class for the vendor's connection) and attaches `ClassRef`.
- **No data to maintain here.** Rows are read with the service role, as every table the invoice
  route needs.

## 3. The function — `src/features/quickbooks-integration/invoice/resolveZoneClass.ts` (new)

`resolveZoneClass(connectionId, venueState)` (server, service role) returns:

- `{ classId: string }` when the state's zone has a row for the connection;
- `{ classId: null, warning }` otherwise, where `warning` is `{ code: "class_missing", state,
reason }` and `reason` is `no_zone` (the state is in no zone) or `no_class` (the zone has
  no row for this connection).

It reads `ZoneStateProvinces` (all rows) and the `ZoneQboClasses` rows of the connection in
**two small queries**, builds the map with `buildZoneByState`, and finds the zone with
`zoneOfEvent({ address_state: venueState }, map)`. It writes nothing and calls no
QuickBooks API.

The warning is a member of the response's `warnings` list (spec 04); the screen's text is
spec 07's.

## 4. Behaviour scenarios

No screen changes, so there is no Playwright scenario of its own; spec 07's scenarios show the
warning.

## 5. Files

**Counted — 1 file** (limit 10):

1. `src/features/quickbooks-integration/invoice/resolveZoneClass.ts` — new

**Not counted:** `resolveZoneClass.test.ts` (new). No migration, no `AppSchema.ts`, no
`database.types.ts`, no `permissionPageData.ts`, no `sync_rules.yaml`.

## 6. Tests and implementation sequence

Red first. Prettier only on touched files.

- **`resolveZoneClass.test.ts`**, with the database replaced by a fake that records its
  queries:
  - a state in a zone that has a row for the connection returns that row's class id;
  - the same zone with a row only for the **other** connection gives `no_class`;
  - a state in no zone gives `no_zone`; a null or blank state gives `no_zone`;
  - spellings that `normalizeStateProvince` treats alike ("SC", "sc", " S C "-style spacing,
    "Washington, D.C." and "DC") find the same zone;
  - a Canadian province in a zone with a row for the Canadian connection returns the one class;
  - exactly two queries run, neither joining a table; nothing is written.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on the touched files. E2E:
  SKIPPED (not run locally, by instruction).

## 7. Edge cases and error handling

- **A zone with no row** (the sixth zone has no row in a file that has no class for it): the
  invoice is made without a Class and the user is told.
- **A class deleted in QuickBooks later.** The stored id is sent, QuickBooks refuses it (an
  invalid reference), and the message passes on (spec 04). Not handled here.
- **A company file that does not track classes.** QuickBooks refuses a `ClassRef`; the message
  passes on. The USA and Canadian files already use classes on bills.
- **Offline / PowerSync.** Not applicable: server-only.
- **Clerk.** The route that calls this code checks the role (spec 04).

## 8. Risks

- **R1 — a quietly missing Class.** The invoice is made without one and only a warning says so;
  nothing lists such invoices afterwards.
- **R2 — a state spelled in an unusual way** in the address is in no zone, so the invoice has
  no Class even though its zone is obvious to a reader.

## 9. Out of scope

- Maintaining zones, their states or their classes.
- Refusing an invoice for a missing Class (the user chose to create it).
- A list of invoices made without a Class.
- Creating a Class in QuickBooks.
