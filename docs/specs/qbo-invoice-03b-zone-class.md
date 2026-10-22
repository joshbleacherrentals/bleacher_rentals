# QuickBooks invoice — the zone as the QuickBooks Class

Status: **BLOCKED — the user has not decided.** No files, no sequence, no tests are written
until the decisions of §2 are taken.
Implementation order: **03b**, between [03](qbo-invoice-03-payload.md) and
[04](qbo-invoice-04-create.md). Plan: [qbo-invoice-plan.md](qbo-invoice-plan.md).
Branch: `q4-sprint1-finance-role`.

## 0. The request, and what is known

The accountant's QuickBooks invoice line has a **Class** box (hidden in the screenshot they
sent). Its choices are the zones, for example `Zone 2 (FL, GA, AL, SC, NC, TN, KY, WV, VA, DC,
MD, DE)`. The user said the quote's zone should be matched to the QuickBooks zone, and that
the app has six zones while the list in the screenshot has five (`Zone 1 (CAN)` to
`Zone 5 (NV, AZ, NM)`).

The user then asked to decide this **later**.

## 1. What the code already has

- `ZoneQboClasses` stores, per QuickBooks connection, the QuickBooks Class id of each zone.
- `ZoneStateProvinces` lists the states and provinces of each zone.
- `create-bill` turns the destination's state into a Class this way: state → zone → class for
  the vendor's connection, and attaches `ClassRef` to each bill line.
- Spec 03 builds the invoice body **without** a `ClassRef`. An invoice made before this spec
  is implemented carries no Class.

## 2. Decisions the user has not taken

**D-a — a quote whose state has no Class for this connection**

- **Option A — refuse the invoice** with a message naming the state and the connection (as
  `create-bill` does for a missing account).
- **Option B — create the invoice without a Class** and say so in the result.
- **User's answer: not given.**

**D-b — the sixth zone**

- **Question:** the app has six zones and the screenshot's list has five. Which zone is the
  sixth, and does a QuickBooks Class exist for it in each file?
- **User's answer: not given.**

**D-c — which address decides the zone**

- **Option A — the quote's venue address** (`Events.address_uuid`), as the invoice's Location
  of Sale. **Option B — another address.**
- **User's answer: not given.**

## 3. Out of scope

Everything else: this stub records the question only. It does not pre-decide the Class, the
mapping screen, or how a missing Class is shown.
