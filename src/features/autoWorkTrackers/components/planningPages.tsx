import type { ComponentType } from "react";
import { EventDashboardTab } from "@/features/eventDashboard/components/EventDashboardTab";
import { EventFulfilmentTab } from "./EventFulfilmentTab";
import { ModelRunsTab } from "./ModelRunsTab";
import { DriverSchedulePage } from "./DriverSchedulePage";
import { DeliveryProofTab } from "@/features/deliveryProof/components/DeliveryProofTab";
import { EventBleacherRequirementsTab } from "@/features/scheduleValidator/components/EventBleacherRequirementsTab";
import { EventDataTab } from "@/features/scheduleValidator/components/EventDataTab";
import { OverbookedBleachersTab } from "@/features/scheduleValidator/components/OverbookedBleachersTab";
import { BleacherDataTab } from "@/features/scheduleValidator/components/BleacherDataTab";
import { DriverWorkloadTab } from "@/features/scheduleValidator/components/DriverWorkloadTab";
import { DriverAvailabilityTab } from "@/features/scheduleValidator/components/DriverAvailabilityTab";
import { DriverDataTab } from "@/features/scheduleValidator/components/DriverDataTab";

/**
 * The component behind each planning page slug. Verify and Auto Generate open the same component
 * for the same slug, so a check exists once; which slugs a tab may open is in utils/pages.
 */
export const PLANNING_PAGES: Record<string, ComponentType> = {
  dashboard: EventDashboardTab,
  "event-fulfilment": EventFulfilmentTab,
  "event-bleacher-requirements": EventBleacherRequirementsTab,
  "event-data": EventDataTab,
  "overbooked-bleachers": OverbookedBleachersTab,
  "bleacher-data": BleacherDataTab,
  "driver-workload": DriverWorkloadTab,
  "driver-availability": DriverAvailabilityTab,
  "driver-data": DriverDataTab,
  "model-runs": ModelRunsTab,
  "delivery-proof": DeliveryProofTab,
  "driver-schedule": DriverSchedulePage,
};
