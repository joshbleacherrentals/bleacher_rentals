import { Minus, Plus, X, ChevronDown, Wrench } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useUser } from "@clerk/nextjs";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useUsersStore } from "@/state/userStore";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { useState, useRef, useEffect } from "react";

export const CreateEventButton = () => {
  const currentEventStore = useCurrentEventStore();
  const maintenanceStore = useMaintenanceEventStore();
  const { user } = useUser();
  const users = useUsersStore((s) => s.users);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const resolveCurrentUserUuid = () => {
    const clerkId = user?.id;
    if (clerkId) {
      const match = users.find((u) => u.clerk_user_id === clerkId);
      if (match) return match.id;
    }
    return null;
  };

  // Event config form is expanded
  if (currentEventStore.isFormExpanded) {
    return (
      <div className="flex items-center justify-end gap-2">
        {!currentEventStore.isFormMinimized ? (
          <>
            <button
              onClick={() => currentEventStore.setField("isFormMinimized", true)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <Minus />
            </button>
            <button
              onClick={() => {
                currentEventStore.setField("isFormExpanded", false);
                currentEventStore.resetForm();
                useCurrentEventStore.getState().setField("ownerUserUuid", null);
              }}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => currentEventStore.setField("isFormMinimized", false)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <Plus />
            </button>
            <button
              onClick={() => {
                currentEventStore.setField("isFormExpanded", false);
                currentEventStore.resetForm();
                useCurrentEventStore.getState().setField("ownerUserUuid", null);
              }}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        )}
      </div>
    );
  }

  // Maintenance form is expanded
  if (maintenanceStore.isFormExpanded) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs font-semibold text-red-600 mb-2">MAINTENANCE</span>
        {!maintenanceStore.isFormMinimized ? (
          <>
            <button
              onClick={() => maintenanceStore.setField("isFormMinimized", true)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-red-600 border-transparent border transition text-gray-500 hover:text-red-600 text-3xl cursor-pointer"
            >
              <Minus />
            </button>
            <button
              onClick={() => maintenanceStore.closeForm()}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-red-600 border-transparent border transition text-gray-500 hover:text-red-600 text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => maintenanceStore.setField("isFormMinimized", false)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-red-600 border-transparent border transition text-gray-500 hover:text-red-600 text-3xl cursor-pointer"
            >
              <Plus />
            </button>
            <button
              onClick={() => maintenanceStore.closeForm()}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-red-600 border-transparent border transition text-gray-500 hover:text-red-600 text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        )}
      </div>
    );
  }

  // Neither form expanded: show split button
  return (
    <div className="mb-2 flex items-center justify-end" ref={dropdownRef}>
      <div className="relative flex">
        <PrimaryButton
          className="rounded-r-none"
          onClick={() => {
            currentEventStore.setField("isFormExpanded", true);
            currentEventStore.setField("isFormMinimized", false);
            if (!currentEventStore.ownerUserUuid) {
              const resolved = resolveCurrentUserUuid();
              if (resolved) {
                useCurrentEventStore.getState().setField("ownerUserUuid", resolved);
              }
            }
          }}
        >
          + New Event
        </PrimaryButton>
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="px-1.5 bg-darkBlue text-white rounded-r hover:bg-lightBlue transition-colors cursor-pointer border-l border-white/20"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </button>
        {dropdownOpen && (
          <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded shadow-md z-50 min-w-[180px]">
            <button
              onClick={() => {
                setDropdownOpen(false);
                maintenanceStore.openForm();
              }}
              className="w-full cursor-pointer px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
            >
              <Wrench className="h-3.5 w-3.5" />
              Maintenance Event
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
