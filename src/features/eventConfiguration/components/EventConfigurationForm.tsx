"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Palette, X, ExternalLink } from "lucide-react";
import { CoreTab } from "./tabs/CoreTab";
import { DetailsTab } from "./tabs/DetailsTab";
import { AlertsTab } from "./tabs/AlertsTab";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canEditEvent } from "@/features/userAccess/logic/canEditEvent";
import { canAccessPath } from "@/features/userAccess/accessConfig";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useDashboardBleachersStore } from "@/features/dashboard/state/useDashboardBleachersStore";
import { useEventFormTransportationAlerts } from "../hooks/useEventFormTransportationAlerts";
import { useEventFormAlerts } from "../hooks/useEventFormAlerts";
import { useBleacherMismatch } from "../hooks/useBleacherMismatch";
import { commitEventHue } from "../functions/saveEventPanelChange";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";

const tabs = ["Core", "Details", "Alerts"] as const;
type Tab = (typeof tabs)[number];

type Props = {
  showSetupTeardown: boolean;
  /** Called when user clicks "Open in Dashboard" - only shown when provided */
  onOpenInDashboard?: () => void;
  /** Called when user clicks "Cancel" - only shown when provided */
  onCancel?: () => void;
};

/**
 * The event as the dashboard shows it: a view, not a form. Every field is read-only; the only
 * things a person can still change from here are the event's colour (the palette, saved when the
 * slider is let go) and, on the grid, its bleachers. docs/specs/dashboard-events-read-only.md.
 */
export const EventConfigurationForm = ({
  showSetupTeardown,
  onOpenInDashboard,
  onCancel,
}: Props) => {
  const currentEventStore = useCurrentEventStore();
  const [activeTab, setActiveTab] = useState<Tab>("Core");
  const permissions = useTeamPermissions();
  useEventFormTransportationAlerts();
  useEventFormAlerts();
  const { hasMismatch: hasDetailsMismatch } = useBleacherMismatch();

  const roles = usePermissionsStore((s) => s.roles);
  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);
  const leadZoneIds = usePermissionsStore((s) => s.leadZoneIds);
  const allBleachers = useDashboardBleachersStore((s) => s.data);

  // Zones of every bleacher attached to this event (part 3 gate).
  const eventBleacherZoneIds = currentEventStore.bleacherUuids
    .map((id) => allBleachers.find((b) => b.bleacherUuid === id && !b.isSubrentalRow)?.zoneUuid)
    .filter((z): z is string => !!z);

  // Who may change the colour and the bleachers: the rule the Update button used to follow.
  const canEdit = canEditEvent({
    isAdmin: permissions.isAdmin,
    isAccountManager: permissions.isAccountManager,
    accountManagerZoneIds,
    leadZoneIds,
    userId: permissions.userId,
    originalOwnerUserUuid: currentEventStore.originalOwnerUserUuid,
    eventBleacherZoneIds,
  });

  // The Quote button is for anyone who can open Quotes & Bookings, whether or not they can edit.
  const canOpenQuote = !!currentEventStore.eventUuid && canAccessPath(roles, "/quotes-bookings");

  // The colour the slider had when the user took hold of it. `undefined`: no gesture under way.
  const hueGestureStart = useRef<number | null | undefined>(undefined);

  const beginHueGesture = () => {
    if (hueGestureStart.current === undefined) {
      hueGestureStart.current = useCurrentEventStore.getState().hslHue;
    }
  };

  // While the slider moves only the store changes (the grid previews it). Letting go writes the
  // colour, and only if it moved; a failed write puts it back where the gesture began.
  const endHueGesture = async () => {
    const startHue = hueGestureStart.current;
    hueGestureStart.current = undefined;
    if (startHue === undefined) return;

    const { eventUuid, hslHue } = useCurrentEventStore.getState();
    if (!eventUuid || hslHue === null) return;

    try {
      await commitEventHue({ eventUuid, startHue, endHue: hslHue });
    } catch (error) {
      console.error("Failed to save the event colour:", error);
      const now = useCurrentEventStore.getState();
      if (now.eventUuid === eventUuid) now.setField("hslHue", startHue);
      createErrorToastNoThrow(["Could not save the colour. It was put back."]);
    }
  };

  // From the pop-up, leaving for the quote also closes the pop-up; nothing else would.
  const handleQuoteClick = () => {
    const state = useCurrentEventStore.getState();
    if (state.isModalOpen) state.closeModal();
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
                onPointerDown={beginHueGesture}
                onPointerUp={endHueGesture}
                onPointerCancel={endHueGesture}
                onKeyDown={beginHueGesture}
                onKeyUp={endHueGesture}
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
          {/* Quote: the read-only quote card, for every role that has Quotes & Bookings */}
          {canOpenQuote && (
            <Link
              href={`/quotes-bookings/${currentEventStore.eventUuid}`}
              title="Open Quote"
              className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-700 text-sm font-semibold border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
              onClick={handleQuoteClick}
            >
              <ExternalLink className="w-4 h-4" />
              Quote
            </Link>
          )}
        </div>
      </div>

      {/* Tab content. Every field in it is read-only. */}
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
