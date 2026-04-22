"use client";

import { useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useMaintenanceEventStore } from "../state/useMaintenanceEventStore";
import { createMaintenanceEvent } from "../db/createMaintenanceEvent";
import { updateMaintenanceEvent } from "../db/updateMaintenanceEvent";
import { deleteMaintenanceEvent } from "../db/deleteMaintenanceEvent";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { MaintenanceCoreTab } from "./tabs/CoreTab";
import { MaintenanceFilesTab } from "./tabs/FilesTab";
import { FetchDashboardBleachers } from "@/features/dashboard/db/client/bleachers";
import { FetchDashboardEvents } from "@/features/dashboard/db/client/events";
import { useDashboardFilterSettings } from "@/features/dashboardOptions/useDashboardFilterSettings";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const tabs = ["Core", "Files"] as const;
type Tab = (typeof tabs)[number];

type MaintenanceEventFormProps = {
  onCancel: () => void;
};

export const MaintenanceEventForm = ({ onCancel }: MaintenanceEventFormProps) => {
  const { user } = useUser();
  const { userId, isLoaded } = useAuth();
  const supabase = useClerkSupabaseClient();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Core");
  const { state: dashboardFilters } = useDashboardFilterSettings();
  const onlyShowMyEvents = dashboardFilters?.onlyShowMyEvents ?? true;

  const store = useMaintenanceEventStore();

  const refreshDashboardStores = async () => {
    if (!supabase || !isLoaded || !userId) return;
    await Promise.all([
      FetchDashboardBleachers(supabase),
      FetchDashboardEvents(supabase, { onlyMine: onlyShowMyEvents, clerkUserId: userId }),
    ]);
  };

  const handleCreate = async () => {
    setLoading(true);
    try {
      const state = useMaintenanceEventStore.getState();
      await createMaintenanceEvent(state, supabase);
      await refreshDashboardStores();
      onCancel();
    } catch {
      // Error toasts handled inside createMaintenanceEvent
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    setLoading(true);
    try {
      const state = useMaintenanceEventStore.getState();
      await updateMaintenanceEvent(state, supabase);
      await refreshDashboardStores();
      onCancel();
    } catch {
      // Error toasts handled inside updateMaintenanceEvent
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const state = useMaintenanceEventStore.getState();
      if (!state.maintenanceEventUuid) return;
      await deleteMaintenanceEvent(state.maintenanceEventUuid, supabase);
      await refreshDashboardStores();
      onCancel();
    } catch {
      // Error toasts handled inside deleteMaintenanceEvent
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!store.maintenanceEventUuid;

  return (
    <div className="p-4">
      <div className="flex items-center gap-2">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`px-2.5 mb-2 rounded-t border-b-2 cursor-pointer ${
                activeTab === tab ? "border-darkBlue font-semibold" : "border-transparent"
              } ${activeTab === tab ? "text-darkBlue" : "text-black/50"}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {/* Delete button - only for existing events */}
          {isEditing && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="px-4 py-2 mr-2 bg-white text-red-800 text-sm font-semibold border border-red-800 rounded-sm hover:bg-red-800 hover:text-white transition cursor-pointer">
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this maintenance event and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer rounded-sm">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
                    onClick={handleDelete}
                  >
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {/* Create/Update button */}
          {!loading ? (
            <button
              className="px-4 py-2 bg-darkBlue text-white text-sm font-semibold rounded-sm shadow-md hover:bg-lightBlue transition cursor-pointer"
              onClick={isEditing ? handleUpdate : handleCreate}
              disabled={loading}
            >
              {isEditing ? "Update Maintenance" : "Add Maintenance"}
            </button>
          ) : (
            <button
              className="bg-gray-400 cursor-not-allowed px-4 py-2 text-white text-sm font-semibold rounded-sm shadow-md transition"
              disabled={true}
            >
              <div className="relative flex items-center justify-center">
                <svg
                  className="w-4 h-4 animate-spin mr-2 fill-white"
                  viewBox="0 0 100 101"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M100 50.5908C100 78.2051 77.6142 100.591 50 
                        100.591C22.3858 100.591 0 78.2051 0 
                        50.5908C0 22.9766 22.3858 0.59082 50 
                        0.59082C77.6142 0.59082 100 22.9766 100 
                        50.5908ZM9.08144 50.5908C9.08144 73.1895 
                        27.4013 91.5094 50 91.5094C72.5987 
                        91.5094 90.9186 73.1895 90.9186 
                        50.5908C90.9186 27.9921 72.5987 9.67226 
                        50 9.67226C27.4013 9.67226 9.08144 
                        27.9921 9.08144 50.5908Z"
                    fill="currentColor"
                  />
                  <path
                    d="M93.9676 39.0409C96.393 38.4038 
                        97.8624 35.9116 97.0079 
                        33.5539C95.2932 28.8227 92.871 
                        24.3692 89.8167 20.348C85.8452 
                        15.1192 80.8826 10.7238 75.2124 
                        7.41289C69.5422 4.10194 63.2754 
                        1.94025 56.7698 1.05124C51.7666 
                        0.367541 46.6976 0.446843 41.7345 
                        1.27873C39.2613 1.69328 37.813 
                        4.19778 38.4501 6.62326C39.0873 
                        9.04874 41.5694 10.4717 44.0505 
                        10.1071C47.8511 9.54855 51.7191 
                        9.52689 55.5402 10.0491C60.8642 
                        10.7766 65.9928 12.5457 70.6331 
                        15.2552C75.2735 17.9648 79.3347 
                        21.5619 82.5849 25.841C84.9175 
                        28.9121 86.7997 32.2913 88.1811 
                        35.8758C89.083 38.2158 91.5421 
                        39.6781 93.9676 39.0409Z"
                    fill="currentFill"
                  />
                </svg>
                <span>Saving...</span>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "Core" && <MaintenanceCoreTab />}
      {activeTab === "Files" && <MaintenanceFilesTab />}
    </div>
  );
};
