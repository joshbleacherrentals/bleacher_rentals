import { useAddressesStore } from "@/state/addressesStore";
import { useBleacherEventsStore } from "@/state/bleacherEventStore";
import { useBleachersStore } from "@/state/bleachersStore";
import { useBlocksStore } from "@/state/blocksStore";
import { useEventsStore } from "@/state/eventsStore";
import { useDriversStore } from "@/state/driversStore";
import { useHomeBasesStore } from "@/state/homeBaseStore";
import { useUserHomeBasesStore } from "@/state/userHomeBasesStore";
// import { useUserRolesStore } from "@/state/userRolesStore";
import { useUserStatusesStore } from "@/state/userStatusesStore";
import { useUsersStore } from "@/state/userStore";
import { Database } from "../../database.types";
import { useTasksStore } from "@/state/tasksStore";
import { useWorkTrackersStore } from "@/state/workTrackersStore";

export type TableName = keyof Database["public"]["Tables"];

type SetStaleFn = () => void;

export const setStaleByTable: Record<TableName, SetStaleFn> = {
  Addresses: () => useAddressesStore.getState().setStale(true),
  BleacherAnnualInspections: () => {},
  // Read reactively through PowerSync on the damage reports page; no Zustand
  // store to invalidate.
  DamageReportAcknowledgements: () => {},
  Maintainers: () => {},
  BleacherEvents: () => useBleacherEventsStore.getState().setStale(true),
  Bleachers: () => useBleachersStore.getState().setStale(true),
  Blocks: () => useBlocksStore.getState().setStale(true),
  Drivers: () => useDriversStore.getState().setStale(true),
  DashboardFilterSettings: () => {},
  Events: () => useEventsStore.getState().setStale(true),
  Tasks: () => useTasksStore.getState().setStale(true),
  HomeBases: () => useHomeBasesStore.getState().setStale(true),
  UserHomeBases: () => useUserHomeBasesStore.getState().setStale(true),
  UserRoles: () => {},
  UserStatuses: () => useUserStatusesStore.getState().setStale(true),
  Users: () => useUsersStore.getState().setStale(true),
  WorkTrackers: () => useWorkTrackersStore.getState().setStale(true),
  BleacherUsers: () => {},
  AccountManagers: () => {},
  AccountManagerZones: () => {},
  Developers: () => {},
  ScorecardTargets: () => {},
  WorkTrackerInspections: () => {},
  WorkTrackerLineItems: () => {},
  InspectionPhotos: () => {},
  Vehicles: () => {},
  Notifications: () => {},
  BlueBook: () => {},
  QboConnections: () => {},
  StripeConnections: () => {},
  Vendors: () => {},
  WorkTrackerGroups: () => {},
  Zones: () => {},
  ZoneQboClasses: () => {},
  ZoneStateProvinces: () => {},
  WorkTrackerTypes: () => {},
  WorkTrackerTypeQboAccounts: () => {},
  DriverUnavailability: () => {},
  DriverPayRanges: () => {},
  DriverDocuments: () => {},
  DriverZones: () => {},
  MaintenanceEvents: () => {},
  DamageReports: () => {},
  BleacherMaintEvents: () => {},
  DamageReportPhotos: () => {},
  InspectionQuestions: () => {},
  MaintenancePhotos: () => {},
  DriverScorecardStatsPerDriver: () => {},
  DriverScoreCardStats: () => {},
  DriverSurveys: () => {},
  DriverSurveyQuestions: () => {},
  DriverSurveyResponses: () => {},
  RoadmapQuarters: () => {},
  RoadmapSprints: () => {},
  RoadmapFeatures: () => {},
  RoadmapFeatureSprintLabels: () => {},
  RoadmapTasks: () => {},
  RoadmapAttachments: () => {},
  RoadmapTaskSubscriptions: () => {},
  RoadmapTaskMessages: () => {},
  RoadmapTaskMessageReadReceipts: () => {},
  RoadmapTaskTypingIndicators: () => {},
  Alerts: () => {},
  UserAlerts: () => {},
  BleacherTypes: () => {},
  Companies: () => {},
  Contacts: () => {},
  EventAttachments: () => {},
  EventChangeLog: () => {},
  EventLineItems: () => {},
  EventMessageMentions: () => {},
  EventMessageReadReceipts: () => {},
  EventMessages: () => {},
  EventSubscriptions: () => {},
  EventTypes: () => {},
  EventTypingIndicators: () => {},
  PaymentHistory: () => {},
  PaymentInstallments: () => {},
  PriceDurations: () => {},
  Prices: () => {},
  SalesOffices: () => {},
  EmailTemplateAttachments: () => {},
  EmailTemplates: () => {},
  EmailTriggerBindings: () => {},
  EventEmailLog: () => {},
  TermsAndConditions: () => {},
  ContractSignatures: () => {},
  EventFiles: () => {},
  SubrentalEvents: () => {},
  StorageLocations: () => {},
  AppVersionPolicy: () => {},
  ChangeLog: () => {},
};
