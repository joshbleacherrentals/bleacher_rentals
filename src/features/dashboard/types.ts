import { Database } from "../../../database.types";
import { AddressData } from "../eventConfiguration/state/useCurrentEventStore";

export type EventStatus = "quoted" | "booked" | "lost";

export type EditBlock = {
  key: string;
  blockUuid: string | null;
  bleacherUuid: string;
  date: string;
  text: string;
  workTrackerUuid: string | null;
};

export type SetupTeardownBlock = {
  bleacherEventUuid: string;
  bleacherUuid: string;
  text: string;
  confirmed: boolean;
  type: "setup" | "teardown";
};

export type Bleacher = {
  bleacherUuid: string;
  bleacherNumber: number;
  bleacherRows: number;
  bleacherSeats: number;
  summerHomeBase: { name: string; homeBaseUuid: string } | null;
  winterHomeBase: { name: string; homeBaseUuid: string } | null;
  bleacherEvents: BleacherEvent[];
  blocks: BleacherBlock[];
  workTrackers: BleacherWorkTracker[];
  maintenanceEvents: BleacherMaintenanceEvent[];
  damageReports: BleacherDamageReport[];
  linxupDeviceId: string | null;

  summerAccountManagerUuid: string | null;
  winterAccountManagerUuid: string | null;
};

export type BleacherEvent = {
  eventUuid: string;
  bleacherEventUuid: string;
  eventName: string;
  address: string;
  eventStart: string;
  eventEnd: string;
  hslHue: number | null;
  booked: boolean;
  goodshuffleUrl: string | null;
  isMaintenance?: boolean;
  hasDamageAlert?: boolean;
  // Mark spans injected from current selection (not yet persisted)
  isSelected?: boolean;
};

export type BleacherBlock = {
  blockUuid: string;
  text: string;
  date: string;
};

export type BleacherWorkTracker = {
  workTrackerUuid: string;
  date: string;
  status: Database["public"]["Enums"]["worktracker_status"];
  pickupTime: string | null;
  dropoffTime: string | null;
  driverUuid: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  dropoffAddress: string | null;
};

export type DashboardBleacher = {
  bleacherUuid: string;
  bleacherNumber: number;
  bleacherRows: number;
  bleacherSeats: number;
  summerHomeBase: {
    homeBaseUuid: string;
    homeBaseName: string;
  };
  winterHomeBase: {
    homeBaseUuid: string;
    homeBaseName: string;
  };
  events: DashboardEvent[];
  blocks: DashboardBlock[];
  relatedWorkTrackers: { workTrackerUuid: string; date: string }[];
};

export type DashboardBlock = {
  blockUuid: string;
  text: string;
  date: string;
};

export type DashboardEvent = {
  eventUuid: string;
  bleacherEventUuid: string;
  eventName: string;
  addressData: AddressData | null;
  seats: number | null;
  sevenRow: number | null;
  tenRow: number | null;
  fifteenRow: number | null;
  setupStart: string;
  setupText: string | null;
  setupConfirmed: boolean;
  sameDaySetup: boolean;
  eventStart: string;
  eventEnd: string;
  teardownEnd: string;
  teardownText: string | null;
  teardownConfirmed: boolean;
  sameDayTeardown: boolean;
  lenient: boolean;
  token: string;
  selectedStatus: EventStatus;
  notes: string;
  numDays: number; // this is inserted into the css propery 2 days should be "200%"
  status: EventStatus;
  hslHue: number | null;
  alerts: string[];
  mustBeClean: boolean;
  bleacherUuids: string[];
  goodshuffleUrl: string | null;
  ownerUserUuid: string | null;
};

export type BleacherMaintenanceEvent = {
  maintenanceEventUuid: string;
  bleacherMaintEventUuid: string;
  eventName: string;
  eventStart: string;
  eventEnd: string;
  costCents: number | null;
  address: string;
};

export type BleacherDamageReport = {
  damageReportUuid: string;
  bleacherUuid: string;
  inspectionUuid: string;
  isSafeToSit: boolean;
  isSafeToHaul: boolean;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
  maintenanceEventUuid: string | null;
  /** Date of the associated work tracker (resolved at mapping time) */
  workTrackerDate: string | null;
};
