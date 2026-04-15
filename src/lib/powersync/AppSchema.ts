import { column, Schema, Table } from "@powersync/web";
import { PowerSyncColsFor } from "./types";

export const ACCOUNT_MANAGERS_TABLE = "AccountManagers";
export const DASHBOARD_FILTER_SETTINGS_TABLE = "DashboardFilterSettings";
export const DRIVERS_TABLE = "Drivers";
export const USERS_TABLE = "Users";
export const WORK_TRACKERS_TABLE = "WorkTrackers";

const AccountManagersCols = {
  created_at: column.text,
  is_active: column.integer,
  user_uuid: column.text,
} satisfies PowerSyncColsFor<"AccountManagers">;
const AccountManagers = new Table(AccountManagersCols, { indexes: { user_uuid: ["user_uuid"] } });

const AddressesCols = {
  created_at: column.text,
  street: column.text,
  city: column.text,
  state_province: column.text,
  zip_postal: column.text,
} satisfies PowerSyncColsFor<"Addresses">;
const Addresses = new Table(AddressesCols);

const BleachersCols = {
  created_at: column.text,
  bleacher_number: column.integer,
  bleacher_rows: column.integer,
  bleacher_seats: column.integer,
  created_by: column.text,
  updated_at: column.text,
  updated_by: column.text,
  linxup_device_id: column.text,
  summer_account_manager_uuid: column.text,
  winter_account_manager_uuid: column.text,
  summer_home_base_uuid: column.text,
  winter_home_base_uuid: column.text,
  hitch_type: column.text,
  vin_number: column.text,
  tag_number: column.text,
  manufacturer: column.text,
  height_folded_ft: column.integer,
  gvwr: column.integer,
  trailer_length: column.integer,
  trailer_height_in: column.integer,
  trailer_length_in: column.integer,
  opening_direction: column.text,
  deleted: column.integer,
  nvis_pdf_path: column.text,
} satisfies PowerSyncColsFor<"Bleachers">;
const Bleachers = new Table(BleachersCols, {
  indexes: {
    summer_account_manager_uuid: ["summer_account_manager_uuid"],
    winter_account_manager_uuid: ["winter_account_manager_uuid"],
    summer_home_base_uuid: ["summer_home_base_uuid"],
    winter_home_base_uuid: ["winter_home_base_uuid"],
  },
});

const BleacherEventsCols = {
  created_at: column.text,
  setup_text: column.text,
  setup_confirmed: column.integer,
  teardown_text: column.text,
  teardown_confirmed: column.integer,
  bleacher_uuid: column.text,
  event_uuid: column.text,
} satisfies PowerSyncColsFor<"BleacherEvents">;
const BleacherEvents = new Table(BleacherEventsCols, {
  indexes: {
    bleacher_uuid: ["bleacher_uuid"],
    event_uuid: ["event_uuid"],
  },
});

const BlocksCols = {
  created_at: column.text,
  text: column.text,
  date: column.text,
  bleacher_uuid: column.text,
} satisfies PowerSyncColsFor<"Blocks">;
const Blocks = new Table(BlocksCols, { indexes: { bleacher_uuid: ["bleacher_uuid"] } });

const EventsCols = {
  created_at: column.text,
  event_name: column.text,
  setup_start: column.text,
  event_start: column.text,
  event_end: column.text,
  teardown_end: column.text,
  total_seats: column.integer,
  seven_row: column.integer,
  ten_row: column.integer,
  fifteen_row: column.integer,
  lenient: column.integer,
  booked: column.integer,
  notes: column.text,
  must_be_clean: column.integer,
  hsl_hue: column.integer,
  goodshuffle_url: column.text,
  address_uuid: column.text,
  created_by_user_uuid: column.text,
  event_status: column.text,
  contract_revenue_cents: column.integer,
  booked_at: column.text,
} satisfies PowerSyncColsFor<"Events">;
const Events = new Table(EventsCols, {
  indexes: {
    created_by_user_uuid: ["created_by_user_uuid"],
    address_uuid: ["address_uuid"],
  },
});

const HomeBasesCols = {
  created_at: column.text,
  home_base_name: column.text,
} satisfies PowerSyncColsFor<"HomeBases">;
const HomeBases = new Table(HomeBasesCols);

const DriversCols = {
  created_at: column.text,
  tax: column.integer,
  pay_rate_cents: column.integer,
  pay_currency: column.text,
  pay_per_unit: column.text,
  is_active: column.integer,
  account_manager_uuid: column.text,
  user_uuid: column.text,
  phone_number: column.text,
  address_uuid: column.text,
  license_photo_path: column.text,
  insurance_photo_path: column.text,
  medical_card_photo_path: column.text,
  vehicle_uuid: column.text,
  vendor_uuid: column.text,
} satisfies PowerSyncColsFor<"Drivers">;
const Drivers = new Table(DriversCols, {
  indexes: {
    account_manager_uuid: ["account_manager_uuid"],
    user_uuid: ["user_uuid"],
    address_uuid: ["address_uuid"],
    vehicle_uuid: ["vehicle_uuid"],
  },
});

const DashboardFilterSettingsCols = {
  created_at: column.text,
  updated_at: column.text,
  user_uuid: column.text,
  y_axis: column.text,
  summer_home_base_uuids: column.text,
  winter_home_base_uuids: column.text,
  rows: column.text,
  state_provinces: column.text,
  only_show_my_events: column.integer,
  optimization_mode: column.integer,
  show_address_tooltip: column.integer,
  season: column.text,
  account_manager_uuid: column.text,
  rows_quick_filter: column.integer,
} satisfies PowerSyncColsFor<"DashboardFilterSettings">;
const DashboardFilterSettings = new Table(DashboardFilterSettingsCols, {
  indexes: {
    user_uuid: ["user_uuid"],
    account_manager_uuid: ["account_manager_uuid"],
  },
});

const TasksCols = {
  created_at: column.text,
  name: column.text,
  description: column.text,
  type: column.text,
  status: column.text,
  created_by_user_uuid: column.text,
} satisfies PowerSyncColsFor<"Tasks">;
const Tasks = new Table(TasksCols, {
  indexes: {
    created_by_user_uuid: ["created_by_user_uuid"],
    type: ["type"],
    status: ["status"],
  },
});

const UsersCols = {
  first_name: column.text,
  last_name: column.text,
  email: column.text,
  phone: column.text,
  clerk_user_id: column.text,
  status_uuid: column.text,
  role: column.integer,
  avatar_image_url: column.text,
  is_admin: column.integer,
  created_at: column.text,
  expo_push_token: column.text,
} satisfies PowerSyncColsFor<"Users">;
const Users = new Table(UsersCols, { indexes: { status_uuid: ["status_uuid"] } });

const UserStatusesCols = {
  created_at: column.text,
  status: column.text,
} satisfies PowerSyncColsFor<"UserStatuses">;
const UserStatuses = new Table(UserStatusesCols);

const WorkTrackersCols = {
  created_at: column.text,
  date: column.text,
  pickup_time: column.text,
  pickup_poc: column.text,
  dropoff_time: column.text,
  dropoff_poc: column.text,
  pay_cents: column.integer,
  notes: column.text,
  internal_notes: column.text,
  pickup_address_uuid: column.text,
  dropoff_address_uuid: column.text,
  bleacher_uuid: column.text,
  driver_uuid: column.text,
  user_uuid: column.text,
  status: column.text,
  released_at: column.text,
  accepted_at: column.text,
  started_at: column.text,
  completed_at: column.text,
  updated_at: column.text,
  pre_inspection_uuid: column.text,
  post_inspection_uuid: column.text,
  worktracker_group_uuid: column.text,
  work_tracker_type_uuid: column.text,
  distance_meters: column.integer,
  drive_minutes: column.integer,
  teardown_required: column.integer,
  pickup_instructions: column.text,
  setup_required: column.integer,
  dropoff_instructions: column.text,
  project_number: column.text,
  bol_number: column.text,
} satisfies PowerSyncColsFor<"WorkTrackers">;
const WorkTrackers = new Table(WorkTrackersCols, {
  indexes: {
    pickup_address_uuid: ["pickup_address_uuid"],
    dropoff_address_uuid: ["dropoff_address_uuid"],
    bleacher_uuid: ["bleacher_uuid"],
    driver_uuid: ["driver_uuid"],
    user_uuid: ["user_uuid"],
    pre_inspection_uuid: ["pre_inspection_uuid"],
    post_inspection_uuid: ["post_inspection_uuid"],
    worktracker_group_uuid: ["worktracker_group_uuid"],
  },
});

const WorkTrackerGroupsCols = {
  created_at: column.text,
  week_start: column.text,
  week_end: column.text,
  driver_uuid: column.text,
  qbo_bill_id: column.text,
  status: column.text,
} satisfies PowerSyncColsFor<"WorkTrackerGroups">;
const WorkTrackerGroups = new Table(WorkTrackerGroupsCols, {
  indexes: {
    driver_uuid: ["driver_uuid"],
    week_start: ["week_start"],
    status: ["status"],
  },
});

const ScorecardTargetsCols = {
  created_at: column.text,
  updated_at: column.text,
  account_manager_uuid: column.text,
  quotes_weekly: column.integer,
  quotes_quarterly: column.integer,
  quotes_annually: column.integer,
  sales_weekly: column.integer,
  sales_quarterly: column.integer,
  sales_annually: column.integer,
  value_of_sales_weekly_cents: column.integer,
  value_of_sales_quarterly_cents: column.integer,
  value_of_sales_annually_cents: column.integer,
  value_of_revenue_weekly_cents: column.integer,
  value_of_revenue_quarterly_cents: column.integer,
  value_of_revenue_annually_cents: column.integer,
  gross_margin_percent_weekly: column.integer,
  gross_margin_percent_quarterly: column.integer,
  gross_margin_percent_annually: column.integer,
} satisfies PowerSyncColsFor<"ScorecardTargets">;
const ScorecardTargets = new Table(ScorecardTargetsCols, {
  indexes: { account_manager_uuid: ["account_manager_uuid"] },
});

const VendorsCols = {
  created_at: column.text,
  qbo_vendor_id: column.text,
  qbo_connection_uuid: column.text,
  display_name: column.text,
  is_active: column.integer,
  logo_url: column.text,
  ein: column.text,
  hst: column.text,
} satisfies PowerSyncColsFor<"Vendors">;
const Vendors = new Table(VendorsCols);

const BleacherUsersCols = {
  created_at: column.text,
  season: column.text,
  bleacher_uuid: column.text,
  user_uuid: column.text,
} satisfies PowerSyncColsFor<"BleacherUsers">;
const BleacherUsers = new Table(BleacherUsersCols, {
  indexes: { bleacher_uuid: ["bleacher_uuid"], user_uuid: ["user_uuid"] },
});

// BlueBook
const BlueBookCols = {
  name: column.text,
  link: column.text,
  document_path: column.text,
  description: column.text,
  is_active: column.integer,
  region: column.text,
  sort_order: column.integer,
  created_at: column.text,
  updated_at: column.text,
} satisfies PowerSyncColsFor<"BlueBook">;
const BlueBook = new Table(BlueBookCols, { indexes: { uuid: ["uuid"] } });

const DriverUnavailabilityCols = {
  driver_uuid: column.text,
  date_unavailable: column.text,
  updated_at: column.text,
} satisfies PowerSyncColsFor<"DriverUnavailability">;
const DriverUnavailability = new Table(DriverUnavailabilityCols, {
  indexes: { driver_uuid: ["driver_uuid"] },
});

const InspectionQuestionsCols = {
  question_text: column.text,
  required: column.integer,
  question_type: column.text,
  is_active: column.integer,
  sort_order: column.integer,
} satisfies PowerSyncColsFor<"InspectionQuestions">;
const InspectionQuestions = new Table(InspectionQuestionsCols, {
  indexes: { sort_order: ["sort_order"] },
});

export const AppSchema = new Schema({
  Addresses,
  AccountManagers,
  DashboardFilterSettings,
  DriverUnavailability,
  Tasks,
  Bleachers,
  BleacherEvents,
  BleacherUsers,
  Blocks,
  BlueBook,
  Events,
  HomeBases,
  Drivers,
  InspectionQuestions,
  ScorecardTargets,
  Users,
  UserStatuses,
  Vendors,
  WorkTrackers,
  WorkTrackerGroups,
});

export type PowerSyncDB = (typeof AppSchema)["types"];
export type BlocksRecord = PowerSyncDB["Blocks"];
export type AddressRecord = PowerSyncDB["Addresses"];
export type AccountManagerRecord = PowerSyncDB["AccountManagers"];
export type DashboardFilterSettingsRecord = PowerSyncDB["DashboardFilterSettings"];
export type TaskRecord = PowerSyncDB["Tasks"];
export type DriverRecord = PowerSyncDB["Drivers"];
export type UserRecord = PowerSyncDB["Users"];
export type UserStatusRecord = PowerSyncDB["UserStatuses"];
export type HomeBasesRecord = PowerSyncDB["HomeBases"];
export type BleachersRecord = PowerSyncDB["Bleachers"];
export type BleacherUsersRecord = PowerSyncDB["BleacherUsers"];
export type BleacherEventsRecord = PowerSyncDB["BleacherEvents"];
export type EventsRecord = PowerSyncDB["Events"];
export type ScorecardTargetsRecord = PowerSyncDB["ScorecardTargets"];
export type VendorRecord = PowerSyncDB["Vendors"];
export type WorkTrackerRecord = PowerSyncDB["WorkTrackers"];
export type WorkTrackerGroupRecord = PowerSyncDB["WorkTrackerGroups"];
export type DriverUnavailabilityRecord = PowerSyncDB["DriverUnavailability"];
export type InspectionQuestionsRecord = PowerSyncDB["InspectionQuestions"];
