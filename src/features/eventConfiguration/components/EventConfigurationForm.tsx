"use client";
import { useState } from "react";
import { Palette, X } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
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
import { CoreTab } from "./tabs/CoreTab";
import { DetailsTab } from "./tabs/DetailsTab";
import { AlertsTab } from "./tabs/AlertsTab";
import { useBleacherEventsStore } from "@/state/bleacherEventStore";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { createEvent, deleteEvent } from "@/features/dashboard/db/client/db";
import { updateEvent } from "@/features/dashboard/db/client/updateEvent";
import { FetchDashboardBleachers } from "@/features/dashboard/db/client/bleachers";
import { FetchDashboardEvents } from "@/features/dashboard/db/client/events";
import { useDashboardFilterSettings } from "@/features/dashboardOptions/useDashboardFilterSettings";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";

const tabs = ["Core", "Details", "Alerts"] as const;
type Tab = (typeof tabs)[number];

type Props = {
  showSetupTeardown: boolean;
  /** Called when user clicks "Open in Dashboard" - only shown when provided */
  onOpenInDashboard?: () => void;
  /** Called when user clicks "Cancel" - only shown when provided */
  onCancel?: () => void;
  /** Whether to show delete button (only for existing events) */
  showDelete?: boolean;
};

export const EventConfigurationForm = ({
  showSetupTeardown,
  onOpenInDashboard,
  onCancel,
  showDelete = true,
}: Props) => {
  const currentEventStore = useCurrentEventStore();
  const [activeTab, setActiveTab] = useState<Tab>("Core");
  const { userId, isLoaded } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const supabase = useClerkSupabaseClient();
  const { state: dashboardFilters } = useDashboardFilterSettings();
  const onlyShowMyEvents = dashboardFilters?.onlyShowMyEvents ?? true;
  const bleacherEvents = useBleacherEventsStore((s) => s.bleacherEvents);

  // Refresh zustand stores directly without invalidating the page query
  const refreshDashboardStores = async () => {
    if (!supabase || !isLoaded || !userId) return;
    await Promise.all([
      FetchDashboardBleachers(supabase),
      FetchDashboardEvents(supabase, { onlyMine: onlyShowMyEvents, clerkUserId: userId }),
    ]);
  };

  const handleCreateEvent = async () => {
    setLoading(true);
    const state = useCurrentEventStore.getState();
    try {
      await createEvent(state, supabase, user ?? null);
      await refreshDashboardStores();
      currentEventStore.resetForm();
      if (currentEventStore.isModalOpen) {
        currentEventStore.closeModal();
      }
    } catch (error) {
      console.error("Failed to create event:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEvent = async () => {
    setLoading(true);
    const state = useCurrentEventStore.getState();
    try {
      await updateEvent(state, supabase, user ?? null, bleacherEvents);
      await refreshDashboardStores();
      currentEventStore.resetForm();
    } catch (error) {
      console.error("Failed to update event:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async () => {
    setLoading(true);
    const state = useCurrentEventStore.getState();
    try {
      await deleteEvent(state.eventUuid, state.addressData?.state ?? "", supabase, user ?? null);
      await refreshDashboardStores();
      currentEventStore.resetForm();
    } catch (error) {
      console.error("Failed to delete event:", error);
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!currentEventStore.eventUuid;

  return (
    <div
      className="p-4"
      style={
        currentEventStore.hslHue !== null
          ? { backgroundColor: `hsl(${currentEventStore.hslHue}, 60%, 60%)` }
          : undefined
      }
    >
      <div className="flex items-center gap-2">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`px-2.5 mb-2 rounded-t border-b-2 cursor-pointer ${
                activeTab === tab ? "border-darkBlue font-semibold" : "border-transparent"
              } ${
                tab === "Alerts" && currentEventStore.alerts.length > 0
                  ? "text-red-700"
                  : activeTab === tab
                    ? "text-darkBlue"
                    : "text-black/50"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === "Alerts" &&
                currentEventStore.alerts.length > 0 &&
                ` (${currentEventStore.alerts.length})`}
            </button>
          ))}
        </div>

        {/* Middle area for hue slider */}
        <div className="flex-1 px-2">
          {currentEventStore.hueOpen && (
            <div className="flex items-center gap-3">
              <input
                aria-label="Event Hue"
                type="range"
                min={0}
                max={359}
                step={1}
                value={currentEventStore.hslHue ?? 0}
                onChange={(e) =>
                  currentEventStore.setField("hslHue", parseInt(e.target.value, 10) || 0)
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-gray-700 w-10 text-right">
                {currentEventStore.hslHue ?? 0}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Palette toggle button */}
          <button
            type="button"
            title={currentEventStore.hueOpen ? "Close hue slider" : "Open hue slider"}
            className="px-2 py-2 bg-white text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
            onClick={() => {
              if (!currentEventStore.hueOpen && currentEventStore.hslHue === null) {
                currentEventStore.setField("hslHue", 0);
              }
              currentEventStore.setField("hueOpen", !currentEventStore.hueOpen);
            }}
          >
            {currentEventStore.hueOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Palette className="w-4 h-4" />
            )}
          </button>

          {/* Delete button - only for existing events */}
          {showDelete && isEditing && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="px-4 py-2 mr-2 bg-white text-red-800 text-sm font-semibold border border-red-800 rounded-sm hover:bg-red-800 hover:text-white transition cursor-pointer">
                  Delete Event
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the event and cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer rounded-sm">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
                    onClick={handleDeleteEvent}
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
              onClick={isEditing ? handleUpdateEvent : handleCreateEvent}
              disabled={loading}
            >
              {isEditing ? "Update Event" : "Create Event"}
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
      {activeTab === "Core" && <CoreTab showSetupTeardown={showSetupTeardown} />}
      {activeTab === "Details" && <DetailsTab />}
      {activeTab === "Alerts" && <AlertsTab />}

      {/* Optional action buttons for modal context */}
      {(onOpenInDashboard || onCancel) && (
        <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-300">
          {onOpenInDashboard && (
            <button
              className="px-4 py-2 text-gray-700 text-sm font-medium border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
              onClick={onOpenInDashboard}
            >
              Open in Dashboard
            </button>
          )}
          {!onOpenInDashboard && <div />}
          {onCancel && (
            <button
              className="px-4 py-2 text-gray-700 text-sm font-medium border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
};
