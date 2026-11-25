import type { Database } from "../../../database.types";

// docs/specs/analytics-mcp.md §11. What the app means by the data, written down once from the code so
// the analytics connector can tell Claude. Typed against database.types.ts: renaming or dropping a
// table or column breaks `npm run tc`, and a new table must get an entry here (D8).
//
// Keep it true: when you change how the app computes or reads something described here, change this
// file in the same commit. Each rule names the file it was taken from.

type PublicTables = Database["public"]["Tables"];
export type TableName = keyof PublicTables & string;

export type TableDoc<T extends TableName> = {
  /** One line: what a row is, or "Internal: …" for plumbing. */
  purpose: string;
  /** Only columns whose meaning is not obvious from the name. */
  columns?: Partial<Record<keyof PublicTables[T]["Row"] & string, string>>;
};

export type DataDictionary = { [T in TableName]: TableDoc<T> };

export type BusinessRule = { topic: string; rule: string; source: string };

const INTERNAL = "Internal app plumbing — ignore for business questions.";

export const BUSINESS_RULES: BusinessRule[] = [
  // --- General conventions ---
  {
    topic: "Money",
    rule: "Columns ending in _cents are integer cents: divide by 100. Exceptions: DriverPayRanges.rate is dollars (numeric); Events.tax_percent and Drivers.tax_dec are percents (13 = 13%); *_bps is basis points (10000 = 100%).",
    source: "src/features/manageTeam/logic/driverPayRanges.ts",
  },
  {
    topic: "Currency — never add CAD and USD",
    rule: "There are two currencies, CAD and USD. Never add amounts of different currencies together: report one total per currency. Events has no currency column: an event's currency is decided by its sales office (Ontario office = CAD, Florida office = USD) and is copied onto EventLineItems.currency and PaymentInstallments.currency — use those. Events with no sales_office_uuid are older ones (created before quotes moved into the app); the app treats them as USD, but some are Canadian: check Addresses.state_province and say so. Driver pay is in Drivers.pay_currency. Repairs have MaintenanceEvents.currency. Bleachers.asset_value_cents is always USD.",
    source:
      "src/features/quotesAndBookings/utils/eventCurrency.ts, supabase/migrations/20261030130000_ar_amount_due.sql",
  },
  {
    topic: "Days and timezone",
    rule: "event_start, event_end, setup_start, teardown_end, WorkTrackers.date and other date columns are plain calendar dates. created_at, booked_at, quote_sent_at, paid_at and other timestamptz columns are UTC instants: the app puts them on a day in America/Toronto, so group with (booked_at AT TIME ZONE 'America/Toronto')::date. Weeks start on Monday.",
    source: "src/lib/useTimezoneStore.ts, src/features/scorecard/util/scorecardAggregation.ts",
  },
  {
    topic: "Soft deletes",
    rule: "Most business tables keep deleted rows. Exclude them unless asked: deleted = false on Events, EventLineItems, Bleachers, BleacherTypes, Companies, Contacts, Venues, SalesOffices, EventTypes, Prices, PriceDurations, TermsAndConditions, StorageLocations, DamageReports, MaintenanceEvents, MaintenanceLineItems; deleted_at IS NULL on PaymentHistory, ArEventTasks, StripeConnections, EmailTemplates, Roadmap*; is_deleted = false on WorkTrackerTypes.",
    source: "src/features/scorecard/hooks/ScorecardStatsContext.tsx",
  },
  {
    topic: "Say which definition you used",
    rule: "Some app numbers have quirks (noted below: tax included, currencies mixed, statuses not filtered). By default match the app's own formula so the answer agrees with the screen, state the caveat in one line, and offer the cleaner number.",
    source: "docs/specs/analytics-mcp.md",
  },
  {
    topic: "What the app does not have",
    rule: "There is no fleet-utilization metric, no revenue-by-zone screen, no 'out of service' flag on bleachers and no maintenance budget-vs-spend page. If asked, compute it from the tables and say it is your own definition, not a number from the app.",
    source: "docs/specs/analytics-mcp.md",
  },

  // --- Sales ---
  {
    topic: "Event status",
    rule: "Events.event_status: draft = 'New', not sent yet; quoted = 'Quote Sent'; booked = 'Quote Signed' (a sale); unsigned_changes = was booked, then the contract was edited after signing (still a sale awaiting re-signature); lost = 'Lost' (lost_reason says why; null on older rows = not recorded). An event never goes back to draft. booked_at is stamped when the status becomes booked and is cleared if it leaves booked/unsigned_changes, so lost events have no booked_at. quote_sent_at is stamped once, the first time the event leaves draft, and never changes (older rows were backfilled from created_at).",
    source:
      "src/features/quotesAndBookings/utils/statusTransitions.ts, src/features/quotesAndBookings/db/changeQuoteStatus.ts, supabase/migrations/20260212175842_scorecard.sql",
  },
  {
    topic: "Event total and tax",
    rule: "Events.contract_revenue_cents is the event's grand total INCLUDING tax (line items after discounts + tax). Pre-tax subtotal = contract_revenue_cents − tax_amount_cents; when tax_amount_cents is null, back it out: total − total / (1 + tax_percent/100). Line items: line total = value_cents × coalesce(quantity, 1); a discount is a line with negative value_cents; a line with bleacher_type_uuid is a bleacher, otherwise a service. Older events have contract_revenue_cents but no line items.",
    source: "src/features/quotesAndBookings/utils/eventAmounts.ts",
  },
  {
    topic: "Sales scorecard KPIs (the /scorecard page)",
    rule: "All over Events with deleted = false. Quotes Sent = count by quote_sent_at in the period (any status). Value of Quotes = sum contract_revenue_cents by quote_sent_at. Sales (Quotes Signed) = count by booked_at in the period (any status). Value of Sales = sum contract_revenue_cents by booked_at. Revenue = sum contract_revenue_cents where event_status = 'booked' by event_start (so unsigned_changes is excluded). Driver Pay = sum WorkTrackers.pay_cents by WorkTrackers.date, no status filter. Gross Margin % = (Revenue − Driver Pay) / Revenue × 100 (0 when Revenue is 0). Caveats: these include tax and add CAD to USD with no conversion. Per account manager: events whose created_by_user_uuid is the manager's Users.id (the quote owner); driver pay of trackers whose Drivers.account_manager_uuid is that manager. Targets are in ScorecardTargets.",
    source:
      "src/features/quotesAndBookings/utils/scorecardTemplates.ts, src/features/scorecard/hooks/accountManager/useAccountManagerScorecard.ts, src/features/scorecard/util/scorecardAggregation.ts",
  },
  {
    topic: "Weekly booked leaderboard",
    rule: "Sum of contract_revenue_cents per quote owner (created_by_user_uuid, who must be an account manager) where event_status = 'booked', contract_revenue_cents > 0 and booked_at falls Monday–Sunday of the week. Quirk: it does not exclude deleted events.",
    source: "src/features/weeklyLeaderboard/hooks/useWeeklyBookedLeaderboard.ts",
  },
  {
    topic: "Event zone",
    rule: "An event's zone is not stored. It is the zone whose ZoneStateProvinces.state_province matches the event address's state_province (else lead_submission->>'state_prov'); no match = 'unknown'. Bleachers.zone_uuid is a bleacher's zone. Account managers own zones through AccountManagerZones, drivers through DriverZones. Sales offices are billing entities (one QuickBooks file and currency each), not regions.",
    source: "src/features/quotesAndBookings/utils/zoneOfEvent.ts",
  },
  {
    topic: "Event dates and seats",
    rule: "event_start..event_end are the event days; setup_start / teardown_end are the delivery and pickup days (null = same day as the event). Rental length for pricing = event_end − event_start + 1 days. lenient = true means the requirement is total_seats in any mix of bleachers; false means the bleacher line items' quantities. seven_row / ten_row / fifteen_row are legacy and no longer used. Bleachers assigned to an event are in BleacherEvents.",
    source:
      "src/features/quotesAndBookings/hooks/usePriceLookup.ts, src/features/alerts/definitions/eventRequirements.ts",
  },
  {
    topic: "Leads",
    rule: "Events.lead_submission not null = an inbound lead from the website form (raw JSON); null = the quote was created in the app.",
    source: "src/features/quotesAndBookings/utils/filterEvents.ts",
  },

  // --- Accounts receivable ---
  {
    topic: "Paid, balance and amount due",
    rule: "Event total for AR = sum of non-deleted line items (value_cents × coalesce(quantity,1)) + coalesce(tax_amount_cents, round(lines × tax_percent/100)); if the event has no lines, contract_revenue_cents. Received = sum PaymentHistory.amount_cents where deleted_at IS NULL, status = 'succeeded' and currency = the event's currency (negative rows are refunds). Balance = max(total − received, 0). The schedule is PaymentInstallments: each is floor(total × percentage_bps / 10000) due on due_date (amount_cents is a deprecated old column). An event with no schedule is due in full on event_start. Amount due = unpaid installments due on or before today (Toronto).",
    source:
      "supabase/migrations/20261030130000_ar_amount_due.sql, supabase/migrations/20261111140000_ar_no_schedule_due_on_start_day.sql, src/features/accountantCollections/utils/collectionsBalances.ts",
  },

  // --- Drivers ---
  {
    topic: "Trip (work tracker) status",
    rule: "WorkTrackers.status: draft = planned by the office, not visible to the driver; released = offered; accepted; dest_pickup, pickup_inspection, dest_dropoff, dropoff_inspection = in progress; completed = done; cancelled = office called it off; declined = driver never took it; abandoned = driver accepted then handed it back. 'Off' (nobody drives it) = cancelled, declined, abandoned. Completed trips = status 'completed'.",
    source:
      "src/features/workTrackers/util/workTrackerEditPolicy.ts, src/features/workTrackers/constants.ts",
  },
  {
    topic: "Driver pay",
    rule: "What a driver is paid for a trip = WorkTrackers.pay_cents (pre-tax, in Drivers.pay_currency). It equals the sum of its WorkTrackerLineItems (round(qty_decimal × unit_amt_cents); use qty_decimal, not quantity). Every pay screen and the QuickBooks bill sum pay_cents WITHOUT a status filter, so cancelled/declined/draft trackers that still carry pay_cents are included — exclude 'off' statuses for 'pay actually earned' and say so. Tax is added per week, not per trip: round(sum × Drivers.tax_dec / 100) (Drivers.tax is a deprecated rounded copy). Hauling = trip size in Drivers.pay_per_unit (KM, MI or HR) × the one DriverPayRanges band it falls in (rate in dollars, min inclusive, max exclusive; not progressive), else Drivers.pay_rate_cents. Deadhead = same size × deadhead_cents. Setup/teardown = setup_cents / teardown_cents per occurrence.",
    source:
      "src/features/workTrackers/util.ts, src/features/workTrackers/db/workTrackerLineItems.ts",
  },
  {
    topic: "Weekly pay groups",
    rule: "WorkTrackerGroups = one driver's pay for one Monday–Sunday week (auto-created). status tracks the QuickBooks bill (draft, qbo_bill_creating, qbo_bill_created, qbo_bill_error, no_bill_ready_for_payment = 'Ready for Payment' without a bill). Whether the money actually went out is is_paid, set by hand — use is_paid for 'paid'.",
    source: "src/features/workTrackers/components/WorkTrackerGroupModal.tsx",
  },
  {
    topic: "Employee vs contractor",
    rule: "Drivers.vendor_uuid null = employee ('Internal Driver'); not null = contractor paid through that Vendors company. A driver counts only when Drivers.is_active.",
    source: "src/features/scheduleValidator/utils/driverKind.ts",
  },
  {
    topic: "Distances and times",
    rule: "WorkTrackers.distance_meters / drive_minutes = the loaded haul, pickup to dropoff (miles = m / 1609.34). deadhead_in_* = empty drive to the pickup (from home or the previous trip); return_home_* = empty drive home after the day's last trip. Each driven km belongs to one tracker. These come from Google; the deadhead/return columns are only filled by the auto planner.",
    source: "supabase/migrations/20261125120000_auto_work_trackers_model_fields.sql",
  },
  {
    topic: "Driver scorecard",
    rule: "DriverScorecardStatsPerDriver is a trigger-maintained sum per driver and year of WorkTrackers (distance, minutes, pay_cents, trip count) over ALL statuses including draft and cancelled. DriverScoreCardStats holds company totals by key (maintenance_cost_per_year = sum MaintenanceEvents.cost_cents by year of event_start, currencies mixed).",
    source: "supabase/migrations/20260603130000_scorecard_triggers_security_definer.sql",
  },
  {
    topic: "Driver survey",
    rule: "Each DriverSurveyResponses row is one answered question; submission_uuid groups one submission. Scores are 1–10 (null for text questions). The app reports the average and NPS: promoters score ≥ 9, detractors ≤ 6, NPS = round((promoters − detractors) / scored × 100).",
    source: "src/features/driverSatisfaction/utils/aggregate.ts",
  },

  // --- Fleet and maintenance ---
  {
    topic: "Damage",
    rule: "A DamageReports row is open while resolved_at IS NULL (and deleted = false). Severity: seat_damage / haul_damage (none, minor, major); if both are none but the legacy is_safe_to_sit / is_safe_to_haul is false, treat it as major. Overall = major if either side is major, else minor if either is minor. fixed_by_driver / fixed_at is a driver's claim, not a resolution. Closest thing to 'out of service' = an open report with major severity.",
    source: "src/lib/damageReportSeverity.ts, src/features/dashboard/util/damageOverlayRanges.ts",
  },
  {
    topic: "Repairs",
    rule: "MaintenanceEvents = one repair = one vendor invoice. status: inbound → triaged → waiting_repair → in_repair → confirm_repair → completed (completed_at stamped). cost_cents = the invoice total = sum of non-deleted MaintenanceLineItems labor + parts + tax + freight (kept by a trigger), in MaintenanceEvents.currency. zone_uuid = the zone the bleacher was in at event_start. MaintenanceBudgets = one budget per year and currency (no page compares it yet).",
    source:
      "src/features/repairs/utils/repairStatus.ts, supabase/migrations/20261123120000_maintenance_schema.sql",
  },
  {
    topic: "Annual inspections",
    rule: "A bleacher's current annual inspection is its newest BleacherAnnualInspections row by created_at. From next_due_on: none = unscheduled, past = overdue, ≤ 7 days = critical, ≤ 30 days = warning, else ok.",
    source: "src/features/annualInspections/logic/inspectionStatus.ts",
  },

  // --- People ---
  {
    topic: "Roles",
    rule: "A user's roles come from: Users.is_admin (admin), Users.is_viewer (viewer), and an is_active = true row in AccountManagers, Drivers, Accountants, Developers or Maintainers. A user can have several. Users.role is legacy — do not use it. Users.status_uuid: 5d314da7-0a1e-4294-b012-ab74f6e07cd6 = active, 75dfeb9e-6c28-4839-a91c-a7333b0921c6 = invited, 7b65d5a1-8ee0-4b7a-816d-d3ec1ed123c5 = inactive (deactivated); join UserStatuses for the name.",
    source:
      "src/features/userAccess/logic/determineAccess.ts, src/features/manageTeam/constants.ts",
  },
  {
    topic: "Legacy columns",
    rule: "Seasons are not used by the app any more: Bleachers.summer_/winter_account_manager_uuid, summer_/winter_home_base_uuid, BleacherUsers, UserHomeBases and HomeBases are legacy. Use Bleachers.zone_uuid with AccountManagerZones for 'whose bleacher'. Drivers.account_manager_uuid is deprecated (zones replace it) but the scorecard still uses it for driver pay.",
    source: "supabase/migrations/20260604200000_zone_assignments.sql",
  },
];

export const DATA_DICTIONARY: DataDictionary = {
  // --- Sales and customers ---
  Events: {
    purpose:
      "One quote or booking for one customer event (the central sales table). See the Event status, Event total and Scorecard rules.",
    columns: {
      event_status:
        "draft | quoted | booked | unsigned_changes | lost — see the Event status rule.",
      contract_revenue_cents: "Grand total INCLUDING tax, in the sales office's currency.",
      tax_amount_cents: "Saved tax (may be a manual override, is_tax_overridden).",
      tax_percent: "Tax rate in percent (13 = 13%).",
      booked_at: "When it became booked (signed). Null unless booked / unsigned_changes.",
      quote_sent_at: "When the quote was first sent. Never changes after.",
      created_by_user_uuid:
        "The quote owner (an account manager's Users.id); can be reassigned. Scorecard attribution.",
      sales_office_uuid: "Decides the currency. Null on older events.",
      setup_start: "Delivery/setup day; null = same day as event_start.",
      teardown_end: "Pickup/teardown day; null = same day as event_end.",
      total_seats: "Seats required when lenient = true.",
      lenient: "true: requirement is total_seats in any bleachers; false: the bleacher line items.",
      seven_row: "Legacy, unused.",
      ten_row: "Legacy, unused.",
      fifteen_row: "Legacy, unused.",
      hsl_hue: "Colour of the event's bar on the scheduling grid.",
      contact_uuid: "Customer contact.",
      finance_contact_uuid: "Billing contact.",
      lead_submission: "Raw website-form JSON; not null = inbound web lead.",
      lost_reason: "Why it was lost (required when lost; null on older lost events).",
      is_qbo: "Set by hand once staff entered the event in QuickBooks.",
      qbo_invoice_id: "Invoice created by the QuickBooks integration.",
      qbo_invoice_mismatch:
        "The QuickBooks invoice differs from the quote (reasons in qbo_invoice_mismatch_reasons, JSON).",
      invoice_number: "App-generated unique number.",
      deleted: "Soft delete — filter deleted = false.",
      address_uuid: "Event site; its state_province decides the zone.",
      goodshuffle_url: "Legacy link to the old booking system.",
    },
  },
  EventLineItems: {
    purpose:
      "Priced lines on a quote: bleachers (bleacher_type_uuid set), services, and discounts (negative value_cents).",
    columns: {
      value_cents: "Unit price in cents; negative = discount.",
      quantity: "Line total = value_cents × coalesce(quantity, 1).",
      currency: "The event's currency — the reliable place to read it.",
      is_template: "Always false; ignore.",
      is_price_overridden: "Price typed by hand instead of from Prices.",
    },
  },
  BleacherEvents: {
    purpose: "Which bleachers are assigned to which event.",
    columns: {
      setup_text: "Setup note for this bleacher at this event.",
      teardown_text: "Teardown note.",
    },
  },
  Blocks: { purpose: "Free-text note on one bleacher for one date on the scheduling grid." },
  EventTypes: { purpose: "Kinds of event (used in pricing)." },
  Prices: {
    purpose: "Price matrix: bleacher type × event type × rental duration × currency.",
    columns: { price_cents: "Price per bleacher for that duration." },
  },
  PriceDurations: { purpose: "Rental-length bands (min_days..max_days) used by Prices." },
  BleacherTypes: {
    purpose: "Bleacher models (e.g. '10 Row'), used on quotes and prices.",
    columns: { description: "Copied into quote line items." },
  },
  Contacts: {
    purpose: "Customer people; belong to a Company.",
    columns: { default_venue_uuid: "Venue pre-filled on new quotes." },
  },
  Companies: { purpose: "Customer organisations." },
  Venues: { purpose: "Named event locations; picking one copies its address onto the event." },
  Addresses: {
    purpose: "Postal addresses with coordinates, shared by events, venues, offices, drivers.",
    columns: { state_province: "Full name or code; decides an event's zone." },
  },
  SalesOffices: {
    purpose:
      "Selling/billing entity: one QuickBooks file and one currency each (Ontario = CAD, Florida LLC = USD). Not a region.",
    columns: { quickbook_uuid: "QuickBooks connection (not readable here); decides currency." },
  },
  ContractSignatures: {
    purpose: "Customer signatures; at most one active per event.",
    columns: { status: "active, or invalidated when the contract changed after signing." },
  },
  TermsAndConditions: { purpose: "Contract templates (HTML); is_default marks the default." },
  EventChangeLog: {
    purpose: "Audit trail of changes to events (field_name, prev_value, next_value, who, when).",
  },
  ScorecardTargets: {
    purpose: "Per-account-manager goals for the sales scorecard (weekly, quarterly, annual).",
    columns: { gross_margin_percent_weekly: "Target percent, not cents." },
  },
  SubrentalEvents: {
    purpose:
      "Request to lend a bleacher to another zone (requested_zone_uuid) for event_start..event_end. Not a sale; no money.",
    columns: { status: "pending | accepted | denied." },
  },
  BlockedCustomerEmails: { purpose: "Customer email addresses the team blocked." },

  // --- Payments ---
  PaymentInstallments: {
    purpose: "An event's payment schedule.",
    columns: {
      percentage_bps: "Share of the event total, basis points (10000 = 100%).",
      amount_cents: "Deprecated; null on new rows. Use percentage_bps.",
      currency: "The event's currency.",
    },
  },
  PaymentHistory: {
    purpose: "Ledger of money received (append-only; negative rows are refunds or corrections).",
    columns: {
      status: "Count only 'succeeded'.",
      deleted_at: "Not null = voided; exclude.",
      entry_source: "stripe (online payment) or manual (entered by accounting).",
      installment_id: "Installment it is applied to.",
      intended_installment_id: "Installment the customer meant to pay.",
    },
  },
  ArEventTasks: {
    purpose:
      "Collections follow-up on an overdue booked event; auto-created when money is due, auto-completed when paid or lost.",
  },
  StripeConnections: { purpose: "Connected Stripe accounts per sales office." },

  // --- Trips and drivers ---
  WorkTrackers: {
    purpose:
      "One trip or job for one driver on one date (deliveries, pickups, moves, repairs). See the Trip status and Driver pay rules.",
    columns: {
      status: "See the Trip (work tracker) status rule.",
      pay_cents:
        "Driver pay for this trip, pre-tax, in the driver's currency. Source of truth for pay.",
      bleacher_uuid: "Bleacher the office assigned.",
      actual_bleacher_uuid:
        "Bleacher the driver confirmed at inspection; null = not confirmed yet.",
      pickup_event_uuid: "Event this trip picks up from (set by a trigger); null = from storage.",
      dropoff_event_uuid: "Event this trip delivers to (set by a trigger); null = to storage.",
      distance_meters: "Loaded haul, pickup to dropoff.",
      drive_minutes: "Loaded haul time.",
      deadhead_in_distance_meters: "Empty drive to the pickup (auto planner only).",
      return_home_distance_meters:
        "Empty drive home after the day's last trip (auto planner only).",
      previous_work_tracker_uuid: "Trip this one follows on the same day; null = starts from home.",
      auto_work_tracker_id:
        "Set when the auto planner made it; cleared when someone edits it by hand.",
      pickup_time: "Legacy text; use pickup_time_mode / pickup_time_start / pickup_time_end.",
      dropoff_time: "Legacy text; use dropoff_time_mode / dropoff_time_start / dropoff_time_end.",
      history_json: "Snapshot written when the trip finishes (addresses, line items, inspections).",
      status_changed_at: "When the status last changed.",
      worktracker_group_uuid: "The driver's pay week.",
      user_uuid: "Legacy; use driver_uuid.",
    },
  },
  WorkTrackerLineItems: {
    purpose:
      "Pay lines of a trip (hauling, deadhead, setup, teardown, maintenance, per_diem, custom). Their total is WorkTrackers.pay_cents.",
    columns: {
      qty_decimal: "The real quantity. Line total = round(qty_decimal × unit_amt_cents).",
      quantity: "Deprecated rounded copy of qty_decimal.",
      is_automatically_managed: "Setup/teardown line the app adds or removes automatically.",
    },
  },
  WorkTrackerGroups: {
    purpose: "One driver's pay for one Monday–Sunday week.",
    columns: {
      status: "QuickBooks bill state — see the Weekly pay groups rule.",
      is_paid: "Set by hand when the money went out. Use this for 'paid'.",
    },
  },
  WorkTrackerTypes: {
    purpose:
      "Kind of work: code trip, repair_maintenance or site_visit_cleaning_other (null code = legacy type).",
  },
  WorkTrackerInspections: {
    purpose:
      "Driver's pre-trip (WorkTrackers.pre_inspection_uuid) or post-trip (post_inspection_uuid) inspection.",
    columns: {
      answers_json:
        "TEXT holding JSON: object keyed per question with question_text, question_type and answer_text / answer_boolean.",
      bleacher_uuid: "Bleacher inspected; null on older rows.",
      issues_found: "The driver reported a problem.",
    },
  },
  InspectionQuestions: { purpose: "The driver inspection checklist." },
  InspectionPhotos: { purpose: "Photos taken during an inspection (files, not data)." },
  Drivers: {
    purpose: "Driver profiles and pay settings, linked to Users. Count only is_active.",
    columns: {
      vendor_uuid: "Null = employee; set = contractor paid through that vendor.",
      pay_rate_cents: "Flat haul rate per pay_per_unit when no DriverPayRanges band matches.",
      pay_per_unit: "KM, MI or HR.",
      deadhead_cents: "Deadhead rate per unit.",
      setup_cents: "Pay per setup.",
      teardown_cents: "Pay per teardown.",
      tax_dec: "Tax rate in percent added to the weekly pay.",
      tax: "Deprecated rounded copy of tax_dec.",
      account_manager_uuid:
        "Deprecated (zones replace it); still used by the scorecard for driver pay.",
      exclude_from_auto_work_trackers: "The auto planner never assigns this driver.",
      address_uuid: "Driver's home.",
      app_version: "Driver app version last reported.",
      bucket_count: "Internal sync diagnostic.",
      sync_version: "Internal sync diagnostic.",
    },
  },
  DriverPayRanges: {
    purpose:
      "Haul pay bands per driver: one rate for the whole trip by trip size (not progressive).",
    columns: {
      rate: "Dollars per unit (NOT cents).",
      min_value: "Inclusive, in the driver's pay_per_unit.",
      max_value: "Exclusive; null = no upper limit.",
    },
  },
  DriverZones: { purpose: "Which zones a driver works in." },
  DriverUnavailability: { purpose: "Dates a driver is not available." },
  DriverDocuments: {
    purpose: "Driver licence, insurance and medical-card photos (files, not data).",
  },
  DriverScorecardStatsPerDriver: {
    purpose: "Trigger-maintained yearly totals per driver from WorkTrackers (all statuses).",
  },
  DriverScoreCardStats: {
    purpose:
      "Trigger-maintained company totals by year and key (maintenance_cost_per_year, cents).",
  },
  DriverSurveys: { purpose: "Driver satisfaction surveys." },
  DriverSurveyQuestions: { purpose: "Questions of a driver survey (kind scale_1_10 or text)." },
  DriverSurveyResponses: {
    purpose: "One answered survey question; submission_uuid groups one submission.",
    columns: { score: "1–10; null for text questions." },
  },
  Vehicles: { purpose: "Drivers' tow vehicles." },
  AutoWorkTrackerSettings: { purpose: "Settings of the auto work-tracker planner (one row)." },
  RouteCache: { purpose: "Internal: cached Google road distances between points for the planner." },

  // --- Fleet ---
  Bleachers: {
    purpose:
      "The fleet: one mobile bleacher trailer each. People refer to them by bleacher_number.",
    columns: {
      bleacher_number: "The number people use for a bleacher.",
      zone_uuid: "The zone that owns it (authoritative).",
      deleted: "Soft delete — filter deleted = false.",
      asset_value_cents: "Asset value, always USD.",
      summer_account_manager_uuid: "Legacy, unused.",
      winter_account_manager_uuid: "Legacy, unused.",
      summer_home_base_uuid: "Legacy label.",
      winter_home_base_uuid: "Legacy label.",
      linxup_device_id: "GPS tracker id (not unique).",
      trailer_length_in: "Inches; replaces trailer_length (feet).",
      trailer_height_in: "Inches; replaces height_folded_ft.",
    },
  },
  BleacherAnnualInspections: {
    purpose: "Yearly safety inspections; history kept, the newest row is current.",
  },
  BleacherMaintEvents: {
    purpose: "Which bleachers a repair covers (kept in step with MaintenanceLineItems).",
  },
  BleacherUsers: { purpose: "Legacy seasonal bleacher assignments — not used." },
  StorageLocations: { purpose: "Yards and lots where bleachers are stored." },
  HomeBases: { purpose: "Legacy yard labels — not used." },
  UserHomeBases: { purpose: "Legacy — not used." },
  Zones: {
    purpose: "Sales/operations regions. Bleachers, drivers and account managers belong to zones.",
  },
  ZoneStateProvinces: { purpose: "Which states/provinces belong to which zone (one zone each)." },
  AccountManagerZones: { purpose: "Which zones an account manager owns (is_lead = lead manager)." },
  DamageReports: {
    purpose: "Damage reported on a bleacher. Open while resolved_at IS NULL. See the Damage rule.",
    columns: {
      seat_damage: "none | minor | major.",
      haul_damage: "none | minor | major.",
      is_safe_to_sit: "Legacy; false counts as major.",
      is_safe_to_haul: "Legacy; false counts as major.",
      resolved_at: "Closed by a manager.",
      fixed_by_driver: "A driver says they fixed it (not a resolution).",
      maintenance_event_uuid: "The repair that addresses it.",
    },
  },
  DamageReportAcknowledgements: {
    purpose: "A driver confirming an existing damage report ('I saw this too').",
  },
  DamageReportCategories: { purpose: "Categories of a damage report (many per report)." },
  DamageCategories: {
    purpose: "Damage categories (Tires, Wiring, Jacks, …); is_active instead of delete.",
  },
  DamageReportPhotos: { purpose: "Photos of a damage report (files, not data)." },
  MaintenanceEvents: {
    purpose: "One repair = one vendor invoice. See the Repairs rule.",
    columns: {
      cost_cents: "Invoice total, in currency.",
      status: "inbound → triaged → waiting_repair → in_repair → confirm_repair → completed.",
      zone_uuid: "Zone the bleacher was in at event_start.",
    },
  },
  MaintenanceLineItems: {
    purpose:
      "Repair lines: one bleacher and damage category each, with labor, parts, tax and freight cents.",
  },
  MaintenanceBudgets: { purpose: "Maintenance budget per year and currency." },
  MaintenancePhotos: { purpose: "Photos of a repair (files, not data)." },
  Vendors: {
    purpose:
      "Supplier companies: repair shops, parts suppliers, and contractor drivers' companies.",
    columns: {
      status: "verified | caution | under_review | prospect | do_not_use; null on older rows.",
    },
  },

  // --- People ---
  Users: {
    purpose: "Everyone with an app login (staff and drivers). Roles: see the Roles rule.",
    columns: {
      role: "Legacy — do not use. Roles come from is_admin, is_viewer and the role tables.",
      status_uuid: "→ UserStatuses (active, invited, inactive).",
      expo_push_token: "Internal.",
    },
  },
  UserStatuses: { purpose: "active, invited, inactive." },
  UserRoles: { purpose: "Legacy role names for Users.role — do not use." },
  AccountManagers: {
    purpose: "Users who sell. Count only is_active.",
    columns: { default_sales_office_uuid: "Office pre-filled on their new quotes." },
  },
  Accountants: { purpose: "Users with the accountant role (is_active)." },
  Developers: { purpose: "Users with the developer role (is_active)." },
  Maintainers: { purpose: "Users with the maintainer role (is_active)." },

  // --- Alerts and messages ---
  Alerts: {
    purpose:
      "System-computed warnings (scheduling conflict, no transportation, …); deleted when no longer true.",
  },
  UserAlerts: { purpose: "Who sees which alert, and whether they dismissed it." },
  Notifications: { purpose: "Log of push notifications sent to users." },
  EventMessages: { purpose: "Internal staff chat on an event (is_system = automatic message)." },
  EventMessageMentions: { purpose: "@mentions in event chat." },
  EventMessageReadReceipts: { purpose: INTERNAL },
  EventTypingIndicators: { purpose: INTERNAL },
  EventSubscriptions: { purpose: "Which staff follow an event's notifications." },
  EventAttachments: { purpose: "Files attached to a quote email (files, not data)." },
  EventFiles: { purpose: "Files uploaded to a quote or booking (files, not data)." },
  EventEmailLog: { purpose: "Each automatic email sent (or failed) for an event." },
  EmailMessages: {
    purpose: "Customer emails synced from Gmail (direction sent/received).",
    columns: { to_addresses: "Raw header text, e.g. 'Pat <pat@x.com>, …' — match with ILIKE." },
  },
  EmailMessageDetails: { purpose: "Email bodies." },
  ContactEmailMessages: { purpose: "Links emails to contacts." },
  EmailTemplates: { purpose: "Automatic email templates." },
  EmailTemplateAttachments: { purpose: INTERNAL },
  EmailTriggerBindings: { purpose: "Which automatic emails are on, per sales office." },
  GmailMailboxSync: { purpose: INTERNAL },

  // --- Integrations and internal ---
  QboConnections: {
    purpose: "QuickBooks connections — not readable through this connector (credentials).",
  },
  ContactQboCustomers: { purpose: "Internal: contact → QuickBooks customer id." },
  EventTypeQboServices: { purpose: "Internal: event type → QuickBooks product." },
  ProvinceQboTaxCodes: { purpose: "Internal: province → QuickBooks tax code." },
  WorkTrackerTypeQboAccounts: { purpose: "Internal: work type → QuickBooks expense account." },
  ZoneQboClasses: { purpose: "Internal: zone → QuickBooks class." },
  McpQueryLog: {
    purpose: "Log of this connector's queries — not readable through this connector.",
  },
  AppVersionPolicy: { purpose: INTERNAL },
  BlueBook: { purpose: "Reference document links shown in the app." },
  ChangeLog: { purpose: "App release notes." },
  DashboardFilterSettings: { purpose: INTERNAL },
  DevAllowedEmails: { purpose: INTERNAL },
  PerfEvents: { purpose: "Internal: app performance telemetry (kept 30 days)." },
  Tasks: { purpose: "Legacy, unused." },
  RoadmapQuarters: { purpose: "Internal: software development roadmap." },
  RoadmapSprints: { purpose: "Internal: software development roadmap." },
  RoadmapFeatures: { purpose: "Internal: software development roadmap." },
  RoadmapFeatureSprintLabels: { purpose: INTERNAL },
  RoadmapTasks: { purpose: "Internal: software development roadmap." },
  RoadmapTaskMessages: { purpose: INTERNAL },
  RoadmapTaskMessageReadReceipts: { purpose: INTERNAL },
  RoadmapTaskSubscriptions: { purpose: INTERNAL },
  RoadmapTaskTypingIndicators: { purpose: INTERNAL },
  RoadmapAttachments: { purpose: INTERNAL },
};
