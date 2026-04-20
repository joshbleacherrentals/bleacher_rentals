"use client";

import { useMaintenanceEventStore } from "../state/useMaintenanceEventStore";
import { MaintenanceEventForm } from "./MaintenanceEventForm";

export const MaintenanceEventPanel = () => {
  const isFormExpanded = useMaintenanceEventStore((s) => s.isFormExpanded);
  const isFormMinimized = useMaintenanceEventStore((s) => s.isFormMinimized);
  const closeForm = useMaintenanceEventStore((s) => s.closeForm);

  const showPanel = isFormExpanded && !isFormMinimized;

  return (
    <div
      className={`overflow-hidden transition-all duration-1000 ease-in-out -mb-2 mt-0 ml-2 ${
        showPanel ? "max-h-[500px]" : "-mt-2 max-h-0"
      }`}
    >
      <div className="shadow-lg border border-red-400 bg-white">
        <MaintenanceEventForm onCancel={closeForm} />
      </div>
    </div>
  );
};
