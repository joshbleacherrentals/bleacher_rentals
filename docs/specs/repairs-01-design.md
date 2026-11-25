# Repairs 01: the design of the Repairs page

Status: **APPROVED 2026-11-18** (design only, nothing to build, uncommitted; 0 open decisions).
Build order: **01 of 11**. Needs: [maintenance-01-database-schema.md](maintenance-01-database-schema.md) (done).
Needed by: 02 to 11. Plan: [repairs-plan.md](repairs-plan.md). Branch: `q4-sprint4-maintenance`.
Scope: **the design only**. No app code, no tests, no permissions row. The deliverable is the
canvas in `docs/design/repairs/` and this text.

## 0. The feature in brief (the same in the plan and in every spec)

**The request (user, 2026-11-18, translated).** At the 2026-11-13 stand-up Sam's Google
spreadsheet (maintenance log, service vendors, bleacher inventory, dashboard) was to move into
the app. This series builds **only the Repairs page**: it replaces the "Maintenance Log" tab of
the spreadsheet, and the page itself is refactored, not added.

- **Not in this series:** the "Dashboard & Analytics" page (a new item in the Quality Assurance
  dropdown), the "Vendors" page (a new sidebar item between Companies & Contacts and Blocked
  Emails), the extra fields on the Assets page (the "Bleacher Inventory" tab). The Driver Parts
  Tracker and the GPS Trackers tabs are not touched and nothing is added for them.
- **The database is done.** [maintenance-01-database-schema.md](maintenance-01-database-schema.md)
  (committed in 5acc3df2): one row of `MaintenanceEvents` is one repair and one invoice; its
  services are rows of `MaintenanceLineItems`; vendor, invoice number, status, currency, zone and
  `completed_at` are columns of the repair; damage categories are a table.
- **How we work.** Every spec runs in its own chat, so every spec repeats this context. Each
  spec exists twice: English in the repository, and a full Ukrainian copy as an artifact that
  is not committed. The user takes every decision; a question is asked, never guessed. A spec
  has no "readings to confirm". The visual details of the design (colours, widths, icons, copy)
  are drawn on the canvas and corrected there.

**Decisions taken by the user (2026-11-18).** The same list is in the plan.

- **D1:** the design is drawn on the Design canvas (`docs/design/repairs/`) from the user's
  answers. Spec 01 is the design only: no app code, no tests, no permissions row. Code starts
  at spec 02.
- **D2:** one row of the list is one repair (one invoice). A click on a row expands it in place.
  Several rows can be open at once.
- **D3:** the expanded block is the table of services (Bleacher, Category, Severity, Reported,
  Description, Labor, Parts, Tax, Freight, Total) with **Add service** under it.
- **D4:** a click on a service row opens the **service window**: the fields of the service, a
  header with the repair's vendor, invoice number, status and currency, a link to the damage
  report, the bleacher's number, model number, type and zone, a button that opens the repair,
  and Edit and Delete.
- **D5:** a button at the end of a repair row opens the **repair window**: every field of the
  repair, the table of services with Add service, the files, Edit and Delete, and the date the
  repair was created (no name).
- **D6:** Edit and New repair use the same window. Edit turns the fields into inputs in place
  (Save, Cancel). **New repair** in the page header opens the window empty, in edit mode. The
  service window works the same way (Edit; Add service opens it empty).
- **D7:** the list has 17 columns: Bleachers, Reported, Repair from, Repair to, Zone, Severity,
  Categories, Notes, Status, Vendor, Invoice #, Labor, Parts, Tax, Freight, Total, Completed.
  Labor, Parts, Tax and Freight in a row are the sums of its services.
- **D8:** when a repair has several services, Bleachers, Categories and Severity show every
  value as a chip.
- **D9:** **Reported** is the date of the driver's damage report. It is found by comparing the
  categories of the report with the category of the service on the same bleacher, and it links
  to the report. A row shows the earliest date and `+N` for the others, and a dash when there is
  no report (a repair entered by hand). No column stores it.
- **D10:** **Repair from** and **Repair to** are `event_start` and `event_end`: the days the
  bleacher is in repair, chosen by the maintainer and still editable. **Completed** is
  `completed_at`: written when the status is marked completed, read-only, a dash while the
  repair is open. Marking a repair completed changes the status (and `completed_at`) and does not
  touch `event_end`. `completed_at` stays in the schema.
- **D11:** the **Notes** column shows the repair's notes (`MaintenanceEvents.notes`) on one line.
  The repair window shows them in full.
- **D12:** two tabs, **Open** (every status except completed) and **Completed**. No counts.
- **D13:** a strip above the tabs shows two totals, CAD and USD, not converted, over the rows of
  the current tab that match the search and the filters.
- **D14:** the toolbar has Search (invoice number, vendor, notes), Bleacher, Zone, Vendor and
  Category (each takes several values), and Show Deleted (as today, for admin and maintainer).
- **D15:** sort arrows are on every column that has one value per row, and not on Bleachers,
  Severity and Categories. The default order is decided in the list spec.
- **D16:** a pager at the bottom: 25, 50 or 100 rows per page with the existing `Pagination`
  component. The page and the size are kept in the URL.
- **D17:** the status pill in a row is a menu: any of the six statuses to any other.
- **D18:** in Edit and New repair the repair window has a Status select (a new repair starts as
  inbound), a read-only Zone (taken from the bleachers), a Vendor select of existing vendors
  only (a new vendor is added on the Vendors page), a Currency select and a read-only Completed.
  The event name is fixed as "Maintenance / Repair". There is no Address field: the vendor's
  address is shown. The owner (`created_by_user_uuid`) stays in the data and is not shown.
- **D19:** the series is split by layers: sync rules, list query, table, toolbar, expanded row
  and service window, repair window, status, writes, permissions, and the Dashboard last.
- **D20:** the Dashboard's maintenance form is replaced by the New repair window, and the old form
  is deleted. This is the last spec of the series.

**What the code has today (researched 2026-11-18).**

- **The page.** `src/app/repairs/page.tsx` renders `RepairsPage`
  (`src/features/qualityAssurance/components/RepairsPage.tsx`): a plain table (Event, Start, End,
  Bleachers, Cost, Notes), a Bleacher select kept in `?bleacher_uuid=`, Show Deleted with a
  Restore button, and a click on a row (admin and maintainer) that opens `MaintenanceEventForm`
  in a dialog.
- **The data hook.** `useRepairs` reads `MaintenanceEvents`, `BleacherMaintEvents` and `Bleachers`
  from the local PowerSync database in two steps (the event ids of a bleacher, then the rows).
- **The form.** `MaintenanceEventForm` has the tabs Core (Event Name, Address, Start Date, End
  Date, Repair Cost, Owner) and Files. The same component is used by the Repairs page and by
  `MaintenanceEventPanel` on the Dashboard. Saving needs an event name, both dates and at least
  one bleacher.
- **The sidebar.** Quality Assurance holds Damage Reports, Inspections, Annual Inspections and
  Repairs; Repairs is shown to admin, account_manager, viewer and maintainer
  (`src/components/sidebar/useSidebarItems.ts`).
- **Rights.** `canManageDamageAndMaintenance` (admin or maintainer) decides who sees Edit,
  Delete, Restore and Show Deleted. The database also lets an account manager write. The
  matrix row is "Repairs & Maintenance" in `src/features/userAccess/permissionPageData.ts`.
- **Sync (`../br_powersync/config/sync_rules.yaml`, web streams).** `MaintenanceEvents.*`,
  `BleacherMaintEvents.*` and `Bleachers.*` reach admin, account_manager, viewer and maintainer.
  `Vendors.*` reaches admin, account_manager and accountant only. No stream carries
  `MaintenanceLineItems`, `DamageCategories`, `DamageReportCategories` or `MaintenanceBudgets`.
- **Precedent for a design spec.** `docs/design/accountant-audit/` and
  `docs/design/accountant-collections/`: a canvas made in the Design editor, copied into the
  repository with a README, skipped by Prettier (`docs/design/**/*.dc.html` and
  `docs/design/**/canvas.json` are in `.prettierignore`).

## 1. What this spec delivers

- **The canvas** `docs/design/repairs/` (eleven boards, §2) and its README, and the published
  copy https://claude.ai/artifact/HUjgVSe5R7kMSmZ3ZyJWP4 (private).
- **This text**, which fixes what the canvas shows, so the later specs can build from it.
- **Nothing else.** `npm run test`, `npm run tc` and Playwright are not touched by this spec.

The user approves the design with "Approved" on this spec. A change to the canvas after that
needs a new "Approved", and the specs that depend on the changed board are updated first.

## 2. The boards

All boards are 1440 px wide. Names, vendors, invoice numbers and amounts are samples that follow
the spreadsheet's maintenance log; a few rows are invented for the statuses the log does not
have (Inbound and Confirm repair).

**1 `Main`: the Open tab.**

- **Header:** the title "Repairs", the line "All maintenance and repair events across the
  fleet" (as today), and the button **New repair** at the right.
- **Strip (D13):** two blocks, "Total cost · CAD" and "Total cost · USD", and a caption at the
  right ("Open repairs that match the filters"). The sums are of the rows drawn.
- **Tabs (D12):** Open and Completed, as a segmented control like the Audit tab.
- **Toolbar (D14):** a search box, four filter buttons (Bleacher, Zone, Vendor, Category), and
  Show Deleted at the right. A filter button with ticked values shows their count and a blue
  outline. Its list has a search field, one checkbox row per value, and a Clear link.
- **Table (D7, D8, D15):** a header row with sort arrows on every column except Bleachers,
  Severity and Categories; one row per repair; the first column (arrow and bleacher chips) and
  the last (the open button) stay in view while the table scrolls sideways.
  - **Status:** a pill with the status name and a chevron (D17).
  - **Money:** right-aligned, with the currency of the repair (`$` or `C$`). A missing amount is
    a dash; a zero is `$0.00`.
  - **Reported (D9):** the earliest date as a link, then `+N`; a dash when there is no report.
  - **Notes (D11):** one line, cut with an ellipsis.
- **Expanded repair (D2, D3):** the services table inside a white card under the row, and the
  button **Add service** below the card. Each service row has a chevron at its end (D4).
- **Pager (D16):** "25 per page" and "1–6 of 6", as the existing component draws them.

**2 `Completed`:** `Main` on the Completed tab. The Completed column is filled.

**3 `StatusMenu`:** the status menu open on a row: six entries, each with a dot in the status
colour, the current one ticked (D17).

**4 `FilterMenu`:** the Category list open with Welding and Jacks ticked; the rows that do not
match are gone and the strip is recomputed.

**5 `Empty`:** no rows: "No repairs found." with the wrench icon, as today.

**6 `ServiceModal`: the service window, view (D4).**

- **Header:** "Service" and the title "Welding · Bleacher #26", a close button.
- **Repair strip:** vendor, invoice number, status pill, currency, and the button **Open repair**.
- **Body:** Bleacher, Category, Severity, Reported (the date and **View Damage Report**),
  Description; at the right the amounts (Labor, Parts, Tax, Freight and Total).
- **Bleacher card:** number, model number, type and zone.
- **Footer:** Delete at the left, Edit at the right.

**7 `ServiceModalEdit` and 8 `ServiceModalNew`:** the same window with inputs (D6): Bleacher,
Category and Severity selects, a Description box, four amount inputs with the `$` sign and a
computed Total. Reported is shown in Edit as read-only ("found from the driver's damage report,
not edited here") and is not shown in Add. The footer has Cancel and Save (Add service in Add).

**9 `InvoiceModal`: the repair window, view (D5).**

- **Header:** "Repair", the title "DTR-2377 · Dallas Trailer Repair", the line "Created 2026-09-17"
  (the date only, D5), a close button.
- **Fields:** Vendor (with its address under it), Invoice #, Status, Currency, Zone, Repair
  from, Repair to, Completed, and Notes in full.
- **Services:** the table with a total row, and **Add service** under it.
- **Files:** a list with an open button for each.
- **Footer:** Delete at the left, Edit at the right.

**10 `InvoiceModalEdit` and 11 `InvoiceModalNew`:** the same window with inputs (D6, D18): a
Vendor select with its address under it, an Invoice # input, a Status select, a Currency select,
Zone as a grey read-only field ("Set from the bleachers"), Repair from and Repair to inputs,
Completed as a grey read-only field ("Set when the status becomes Completed"), a Notes box. Files
gain a delete button on each row and a drop zone ("PDF, photos, Word or Excel"). New repair
starts as Inbound with an empty services area ("No services yet. Add the first one."). The footer
has Cancel and Save (Add repair in New).

## 3. The visual rules the canvas uses

These are drawn choices, not options; they are corrected on the canvas.

- **Look:** the app's own look: Geist, the brand navy `#10365a` for titles and the primary button,
  the Tailwind greys, and the soft fill with a matching ink for the pills (as in the Audit
  design). Contrast is 4.5:1 or better for text.
- **Statuses:** Inbound blue, Triaged purple, Waiting repair amber, In repair orange, Confirm
  repair teal, Completed green. The word is always printed.
- **Severity:** Major red, Minor amber, Routine grey. Categories and bleachers are neutral chips.
- **Windows:** 760 px (service) and 1080 px (repair) wide, on a dimmed page, with the app's modal
  shadow. Dropdown lists inside the windows are drawn closed.
- **Dates:** `YYYY-MM-DD`, as in the Audit design.
- **Column order:** Reported, Repair from and Repair to sit together after Bleachers; the money
  columns are together before Completed.

## 4. Not drawn, and left to the later specs

- **Show Deleted:** the button is in the toolbar as today; how deleted repairs are listed with the
  tabs is settled in spec 05.
- **Loading and error states.**
- **Delete confirmations:** the existing "Are you absolutely sure?" dialog is reused.
- **Views for roles that cannot edit** (no New repair, Edit, Delete or status menu): spec 10.
- **Narrow screens.**
- **The default order of the rows and the exact rule that finds Reported:** specs 05 and 03.
- **The currency pre-fill, the zone of a repair and the duplicate invoice check:** spec 09.

## 5. Files

- `docs/design/repairs/canvas.json` and the eleven `.dc.html` files (new).
- `docs/design/repairs/README.md` (new).
- `docs/specs/repairs-plan.md` and this spec (new), and their Ukrainian copies as artifacts (not
  committed).

## 6. Definition of done

- The user has looked at the canvas and written "Approved".
- `npx prettier --check` on `docs/design/repairs/README.md`, `docs/specs/repairs-plan.md` and this
  spec is clean (the `.dc.html` files and `canvas.json` are skipped by `.prettierignore`).
- `npm run tc`, `npm run test` and Playwright: SKIPPED, because no code changes.
