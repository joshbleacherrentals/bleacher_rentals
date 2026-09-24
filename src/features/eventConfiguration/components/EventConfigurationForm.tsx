"use client";
import { useState } from "react";
import { Palette, X, ExternalLink } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
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
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { createEvent, deleteEvent } from "@/features/dashboard/db/client/db";
import { updateEvent } from "@/features/dashboard/db/client/updateEvent";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { usePsUsers } from "@/features/dashboard/db/hooks/powersync/usePsUsers";
import { triage } from "@/features/alerts/triage";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canEditOwnedEntity } from "@/features/userAccess/logic/canEditOwnedEntity";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useDashboardBleachersStore } from "@/features/dashboard/state/useDashboardBleachersStore";
import { useCreateQuoteStore } from "@/features/quotesAndBookings/state/useCreateQuoteStore";
import { useEventFormTransportationAlerts } from "../hooks/useEventFormTransportationAlerts";
import { useEventFormAlerts } from "../hooks/useEventFormAlerts";
import { useBleacherMismatch } from "../hooks/useBleacherMismatch";
import { validateLostReason } from "@/features/quotesAndBookings/utils/lostReason";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";

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
  const users = usePsUsers();
  const permissions = useTeamPermissions();
  const router = useRouter();
  useEventFormTransportationAlerts();
  useEventFormAlerts();
  const { hasMismatch: hasDetailsMismatch } = useBleacherMismatch();

  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);
  const leadZoneIds = usePermissionsStore((s) => s.leadZoneIds);
  const allBleachers = useDashboardBleachersStore((s) => s.data);

  // Zones of every bleacher attached to this event (part 3 gate).
  const eventBleacherZoneIds = currentEventStore.bleacherUuids
    .map((id) => allBleachers.find((b) => b.bleacherUuid === id && !b.isSubrentalRow)?.zoneUuid)
    .filter((z): z is string => !!z);

  const isEditing = !!currentEventStore.eventUuid;
  const canEdit = permissions.canCreateUser
    ? canEditOwnedEntity({
        isAdmin: permissions.isAdmin,
        isNew: !isEditing,
        isAccountManager: permissions.isAccountManager,
        accountManagerZoneIds,
        leadZoneIds,
        createdByUserId: currentEventStore.originalOwnerUserUuid,
        userId: permissions.userId,
        eventBleacherZoneIds,
      })
    : false;

  const resolveSaverUuid = (): string | null => {
    if (!userId) return null;
    return users.find((u) => u.clerk_user_id === userId)?.id ?? null;
  };

  // Marking an event lost is the last moment the reason can be captured, so no
  // save goes through without one. Any other status saves as before.
  const lostReasonBlocks = (state: ReturnType<typeof useCurrentEventStore.getState>): boolean => {
    const errors = validateLostReason({ ...state, status: state.selectedStatus });
    if (errors.length > 0) createErrorToastNoThrow(errors);
    return errors.length > 0;
  };

  const handleCreateEvent = async () => {
    const state = useCurrentEventStore.getState();
    if (lostReasonBlocks(state)) return;
    setLoading(true);
    try {
      const newEventUuid = await createEvent(state, supabase, user ?? null);
      await triage("Events", { id: newEventUuid }, supabase);
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
    const state = useCurrentEventStore.getState();
    if (lostReasonBlocks(state)) return;
    setLoading(true);
    try {
      const { removedBleacherUuids } = await updateEvent(state, supabase, user ?? null);
      if (state.eventUuid) {
        await triage(
          "Events",
          { id: state.eventUuid, removed_bleacher_uuids: removedBleacherUuids },
          supabase,
        );
      }
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
      if (state.eventUuid) {
        await triage("Events_deleted", { id: state.eventUuid }, supabase);
      }
      await deleteEvent(state.eventUuid, state.addressData?.state ?? "", supabase, user ?? null);
      currentEventStore.resetForm();
    } catch (error) {
      console.error("Failed to delete event:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetails = () => {
    const state = useCurrentEventStore.getState();
    if (state.eventUuid) {
      // Existing event — go straight to its edit page
      router.push(`/quotes-bookings/${state.eventUuid}/edit`);
    } else {
      // Unsaved event — pre-populate the quote store and open the new quote page
      const store = useCreateQuoteStore.getState();
      store.resetForm();
      store.setField("eventName", state.eventName);
      store.setField("eventStart", state.eventStart);
      store.setField("eventEnd", state.eventEnd);
      store.setField("ownerUserUuid", state.ownerUserUuid);
      if (state.addressData) {
        store.setField("eventAddress", state.addressData.address ?? "");
        store.setField("eventAddressData", {
          street: state.addressData.address ?? "",
          city: state.addressData.city ?? "",
          stateProvince: state.addressData.state ?? "",
          zipPostal: state.addressData.postalCode ?? "",
        });
      }
      router.push("/quotes-bookings/new");
    }
  };

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
          {tabs.map((tab) => {
            const hasWarning =
              (tab === "Alerts" && currentEventStore.alerts.length > 0) ||
              (tab === "Details" && hasDetailsMismatch);
            return (
              <button
                key={tab}
                data-testid={`event-tab-${tab}`}
                className={`px-2.5 mb-2 rounded-t border-b-2 cursor-pointer ${
                  activeTab === tab ? "border-darkBlue font-semibold" : "border-transparent"
                } ${
                  hasWarning
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
                {tab === "Details" && hasDetailsMismatch && " !"}
              </button>
            );
          })}
        </div>

        {/* Middle area for hue slider */}
        <div className="flex-1 px-2">
          {currentEventStore.hueOpen && canEdit && (
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
          {canEdit && (
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
          )}
          {/* Quote button — always visible when canEdit */}
          {canEdit && (
            <button
              type="button"
              title="Open Quote"
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 text-sm font-semibold border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
              onClick={handleOpenDetails}
            >
              <ExternalLink className="w-4 h-4" />
              Quote
            </button>
          )}
          {/* Delete button - only for existing events the user can edit */}
          {showDelete && isEditing && canEdit && (
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

          {/* Create/Update button — only when user can edit */}
          {canEdit &&
            (!loading ? (
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
            ))}
        </div>
      </div>

      {/* Read-only banner for non-owners */}
      {!canEdit && isEditing && (
        <div className="mb-2 rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
          You have read-only access to this event.
        </div>
      )}

      {/* Tab content */}
      <fieldset disabled={!canEdit}>
        {activeTab === "Core" && (
          <CoreTab showSetupTeardown={showSetupTeardown} disabled={!canEdit} />
        )}
        {activeTab === "Details" && <DetailsTab />}
        {activeTab === "Alerts" && <AlertsTab />}
      </fieldset>

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
