"use client";

import { Check, Trash, Truck, X, CalendarPlus, Wrench, Handshake, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSelectedBlockStore } from "../state/useSelectedBlock";
import { Tables } from "../../../../database.types";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useQueryClient } from "@tanstack/react-query";
import { deleteBlock, saveBlock } from "../db/client/db";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { useUser } from "@clerk/nextjs";
import { usePsUsers } from "@/features/dashboard/db/hooks/powersync/usePsUsers";
import { AppTooltip } from "@/components/AppTooltip";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useDashboardBleachersStore } from "../state/useDashboardBleachersStore";
import { isBleacherOwnedByAM } from "@/features/userAccess/logic/isBleacherOwnedByAM";
import { canEditCell as canEditCellFn } from "@/features/userAccess/logic/canEditCell";
import { useSubrentalEventStore } from "@/features/subrentals/state/useSubrentalEventStore";
import { SUBRENTAL_COLOR } from "@/features/dashboard/values/constants";
import { DamageReportModal, EditDamageReport } from "@/app/damage-reports/DamageReportModal";
import { useDamageReports } from "@/app/damage-reports/_lib/db";
import {
  buildWorkTrackerDraft,
  checkWorkTrackerOpenAccess,
} from "@/features/workTrackers/util/createWorkTrackerDraft";

type CellEditorProps = {
  onWorkTrackerOpen?: (workTracker: Tables<"WorkTrackers">) => void;
};

export default function CellEditor({ onWorkTrackerOpen }: CellEditorProps) {
  const qc = useQueryClient();
  const supabase = useClerkSupabaseClient();
  const { user } = useUser();
  const users = usePsUsers();
  const { isOpen, key, blockUuid, bleacherUuid, date, text, workTrackerUuid, setField, resetForm } =
    useSelectedBlockStore();

  // ── Permissions: determine if user can edit this cell ──
  const perms = usePermissionsStore();
  const dashBleachers = useDashboardBleachersStore((s) => s.data);
  const isViewer = !perms.isAdmin && !perms.isAccountManager;
  const bl = dashBleachers.find((b) => b.bleacherUuid === bleacherUuid) ?? null;
  const canEditCell = canEditCellFn({
    isAdmin: perms.isAdmin,
    isAccountManager: perms.isAccountManager,
    accountManagerZoneIds: perms.accountManagerZoneIds,
    bleacherUuid,
    bleacher: bl ? { zoneUuid: bl.zoneUuid } : null,
  });

  // Open (unresolved) damage report on the clicked bleacher, if any. Read
  // reactively from PowerSync so it stays in sync and carries the photos +
  // creator the modal needs — no online fetch required.
  const { reports: bleacherDamageReports } = useDamageReports({ bleacherUuid, showDeleted: false });
  // Maintenance event covering the clicked date (its window is the "in-repair" stripe).
  // Creating a maintenance event auto-resolves the bleacher's damage reports and links
  // them via maintenance_event_uuid, so an unresolved-only lookup loses the button.
  const maintEventAtDate = bl?.maintenanceEvents.find(
    (m) => date >= m.eventStart.substring(0, 10) && date <= m.eventEnd.substring(0, 10),
  );
  const openDamageReport = bleacherUuid
    ? (bleacherDamageReports.find((d) => d.resolved_at === null) ??
      (maintEventAtDate
        ? (bleacherDamageReports.find(
            (d) => d.maintenance_event_uuid === maintEventAtDate.maintenanceEventUuid,
          ) ?? null)
        : null))
    : null;
  const [viewingDamageReport, setViewingDamageReport] = useState<EditDamageReport | null>(null);

  const handleViewDamageReport = () => {
    if (openDamageReport) setViewingDamageReport(openDamageReport as EditDamageReport);
  };

  const [handshakeHover, setHandshakeHover] = useState(false);
  const [currentText, setCurrentText] = useState(text);
  const subrentalHexColor = `#${SUBRENTAL_COLOR.toString(16).padStart(6, "0")}`;
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setCurrentText(text);
  }, [text]);

  useEffect(() => {
    if (isOpen && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isOpen]);

  const handleSave = async () => {
    setCurrentText("");
    try {
      const editBlock = {
        key,
        blockUuid,
        bleacherUuid,
        date,
        text: currentText,
        workTrackerUuid,
      };
      await saveBlock(editBlock, supabase);
      resetForm();
    } catch (error) {
      console.error("Failed to Save Block:", error);
    }
  };

  const handleDelete = async () => {
    if (!blockUuid) return;

    try {
      const editBlock = {
        key,
        blockUuid,
        bleacherUuid,
        date,
        text: currentText,
        workTrackerUuid,
      };
      await deleteBlock(editBlock, supabase);
      resetForm();
    } catch (error) {
      console.error("Failed to Delete Block:", error);
    }
  };

  const handleOpenWorkTracker = () => {
    if (!date || !bleacherUuid) {
      createErrorToast(["Failed to open work tracker. Missing date or bleacher id."]);
      return;
    }

    const perms = usePermissionsStore.getState();
    const access = checkWorkTrackerOpenAccess({
      bleacherUuid,
      date,
      workTrackerUuid,
      perms: {
        isAdmin: perms.isAdmin,
        isAccountManager: perms.isAccountManager,
        accountManagerZoneIds: perms.accountManagerZoneIds,
      },
      allBleachers: useDashboardBleachersStore.getState().data,
    });

    if (!access.allowed) {
      createErrorToast(access.messages);
      return;
    }

    onWorkTrackerOpen?.(buildWorkTrackerDraft({ bleacherUuid, date, workTrackerUuid }));
  };

  const handleCreateEvent = () => {
    if (!date || !bleacherUuid) {
      createErrorToast(["Failed to create event. Missing date or bleacher id."]);
      return;
    }

    // AM can only create events with own bleachers — OR within an accepted subrental date range
    const perms = usePermissionsStore.getState();
    let subrentalConstraint: { eventStart: string; eventEnd: string } | null = null;
    if (perms.isAccountManager && !perms.isAdmin) {
      const dashBleachers = useDashboardBleachersStore.getState().data;
      // Must find the original (non-subrental) row — when a zone filter hides the original zone,
      // only the subrental row is in the store; treat that as "not owned" so we fall through
      // to the subrental constraint check rather than bypassing it entirely.
      const bleacher = dashBleachers.find(
        (b) => b.bleacherUuid === bleacherUuid && !b.isSubrentalRow,
      );
      const ownedByAM =
        bleacher &&
        isBleacherOwnedByAM({
          bleacherZoneUuid: bleacher.zoneUuid,
          accountManagerZoneIds: perms.accountManagerZoneIds,
        });
      if (!ownedByAM) {
        // Find the specific accepted subrental range covering this date
        const subrentalRow = dashBleachers.find(
          (b) =>
            b.bleacherUuid === bleacherUuid &&
            b.isSubrentalRow &&
            perms.accountManagerZoneIds.includes(b.zoneUuid ?? "") &&
            (b.acceptedSubrentalAccess ?? []).some(
              (r) => date >= r.eventStart.substring(0, 10) && date <= r.eventEnd.substring(0, 10),
            ),
        );
        const matchingRange = subrentalRow?.acceptedSubrentalAccess?.find(
          (r) => date >= r.eventStart.substring(0, 10) && date <= r.eventEnd.substring(0, 10),
        );
        if (!matchingRange) {
          createErrorToast(["You can only create events with bleachers assigned to you."]);
          return;
        }
        subrentalConstraint = {
          eventStart: matchingRange.eventStart.substring(0, 10),
          eventEnd: matchingRange.eventEnd.substring(0, 10),
        };
      }
    }

    const eventStore = useCurrentEventStore.getState();

    // Calculate end date (7 days after start date), clamped to subrental window if applicable
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    // Format dates as YYYY-MM-DD
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    let clampedStart = formatDate(startDate);
    let clampedEnd = formatDate(endDate);
    if (subrentalConstraint) {
      const { eventStart: srStart, eventEnd: srEnd } = subrentalConstraint;
      if (clampedStart < srStart) clampedStart = srStart;
      if (clampedStart > srEnd) clampedStart = srStart;
      if (clampedEnd > srEnd) clampedEnd = srEnd;
      if (clampedEnd < clampedStart) clampedEnd = clampedStart;
    }

    // Cap end date against accepted subrental blocks on this bleacher:
    // 1. If clampedStart falls inside a block (e.g. we clicked a subrental row), cap at that block's end.
    // 2. Also cap at the day before the next block that starts after clampedStart.
    {
      const allBleachers = useDashboardBleachersStore.getState().data;
      const originalBleacher = allBleachers.find(
        (b) => b.bleacherUuid === bleacherUuid && !b.isSubrentalRow,
      );
      const blocks = originalBleacher?.acceptedSubrentalBlocks ?? [];

      // Current block: a block that contains clampedStart
      const currentBlock = blocks.find(
        (r) =>
          r.eventStart.substring(0, 10) <= clampedStart &&
          r.eventEnd.substring(0, 10) >= clampedStart,
      );
      if (currentBlock) {
        const blockEnd = currentBlock.eventEnd.substring(0, 10);
        if (blockEnd < clampedEnd) clampedEnd = blockEnd;
      }

      // Next block: the earliest block starting strictly after clampedStart
      const nextBlockStart = blocks
        .map((r) => r.eventStart.substring(0, 10))
        .filter((s) => s > clampedStart)
        .sort()[0];
      if (nextBlockStart) {
        const d = new Date(nextBlockStart + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        const dayBefore = d.toISOString().split("T")[0];
        if (dayBefore < clampedEnd) clampedEnd = dayBefore;
      }

      if (clampedEnd < clampedStart) clampedEnd = clampedStart;
    }

    // Set the event configuration
    eventStore.setField("isFormExpanded", true);
    eventStore.setField("isFormMinimized", false);
    eventStore.setField("eventStart", clampedStart);
    eventStore.setField("eventEnd", clampedEnd);
    eventStore.setField("bleacherUuids", [bleacherUuid]);
    if (subrentalConstraint) {
      eventStore.setField("subrentalConstraint", subrentalConstraint);
    }

    // Set current user as owner
    if (!eventStore.ownerUserUuid) {
      const clerkId = user?.id;
      if (clerkId) {
        const match = users.find((u) => u.clerk_user_id === clerkId);
        if (match) eventStore.setField("ownerUserUuid", match.id);
      }
    }

    // Close the cell editor
    handleClose();
  };

  const handleCreateMaintenance = () => {
    if (!date || !bleacherUuid) {
      createErrorToast(["Failed to create maintenance event. Missing date or bleacher id."]);
      return;
    }

    // AM can only create maintenance events with own bleachers — OR within an accepted subrental date range
    const perms = usePermissionsStore.getState();
    let subrentalConstraint: { eventStart: string; eventEnd: string } | null = null;
    if (perms.isAccountManager && !perms.isAdmin) {
      const dashBleachers = useDashboardBleachersStore.getState().data;
      // Must find the original (non-subrental) row — when a zone filter hides the original zone,
      // only the subrental row is in the store; treat that as "not owned" so we fall through
      // to the subrental constraint check rather than bypassing it entirely.
      const bleacher = dashBleachers.find(
        (b) => b.bleacherUuid === bleacherUuid && !b.isSubrentalRow,
      );
      const ownedByAM =
        bleacher &&
        isBleacherOwnedByAM({
          bleacherZoneUuid: bleacher.zoneUuid,
          accountManagerZoneIds: perms.accountManagerZoneIds,
        });
      // Block if owned but subrented out on the clicked date
      if (ownedByAM) {
        const subrented = (bleacher?.acceptedSubrentalBlocks ?? []).some(
          (r) => date >= r.eventStart.substring(0, 10) && date <= r.eventEnd.substring(0, 10),
        );
        if (subrented) {
          createErrorToast(["This bleacher is subrented out on this date."]);
          return;
        }
      }
      if (!ownedByAM) {
        const subrentalRow = dashBleachers.find(
          (b) =>
            b.bleacherUuid === bleacherUuid &&
            b.isSubrentalRow &&
            perms.accountManagerZoneIds.includes(b.zoneUuid ?? "") &&
            (b.acceptedSubrentalAccess ?? []).some(
              (r) => date >= r.eventStart.substring(0, 10) && date <= r.eventEnd.substring(0, 10),
            ),
        );
        const matchingRange = subrentalRow?.acceptedSubrentalAccess?.find(
          (r) => date >= r.eventStart.substring(0, 10) && date <= r.eventEnd.substring(0, 10),
        );
        if (!matchingRange) {
          createErrorToast([
            "You can only create maintenance events with bleachers assigned to you.",
          ]);
          return;
        }
        subrentalConstraint = {
          eventStart: matchingRange.eventStart.substring(0, 10),
          eventEnd: matchingRange.eventEnd.substring(0, 10),
        };
      }
    }

    const maintenanceStore = useMaintenanceEventStore.getState();

    // Calculate end date (7 days after start date), clamped to subrental window if applicable
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    // Format dates as YYYY-MM-DD
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    let clampedStart = formatDate(startDate);
    let clampedEnd = formatDate(endDate);
    if (subrentalConstraint) {
      const { eventStart: srStart, eventEnd: srEnd } = subrentalConstraint;
      if (clampedStart < srStart) clampedStart = srStart;
      if (clampedStart > srEnd) clampedStart = srStart;
      if (clampedEnd > srEnd) clampedEnd = srEnd;
      if (clampedEnd < clampedStart) clampedEnd = clampedStart;
    }

    // Cap end date at the day before the next accepted subrental block on this bleacher
    {
      const allBleachers = useDashboardBleachersStore.getState().data;
      const originalBleacher = allBleachers.find(
        (b) => b.bleacherUuid === bleacherUuid && !b.isSubrentalRow,
      );
      const blocks = originalBleacher?.acceptedSubrentalBlocks ?? [];

      // Current block: a block that contains clampedStart
      const currentBlock = blocks.find(
        (r) =>
          r.eventStart.substring(0, 10) <= clampedStart &&
          r.eventEnd.substring(0, 10) >= clampedStart,
      );
      if (currentBlock) {
        const blockEnd = currentBlock.eventEnd.substring(0, 10);
        if (blockEnd < clampedEnd) clampedEnd = blockEnd;
      }

      // Next block: the earliest block starting strictly after clampedStart
      const nextBlockStart = blocks
        .map((r) => r.eventStart.substring(0, 10))
        .filter((s) => s > clampedStart)
        .sort()[0];
      if (nextBlockStart) {
        const d = new Date(nextBlockStart + "T12:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        const dayBefore = d.toISOString().split("T")[0];
        if (dayBefore < clampedEnd) clampedEnd = dayBefore;
      }

      if (clampedEnd < clampedStart) clampedEnd = clampedStart;
    }

    // Open the maintenance form (resets to initial state) then prefill
    maintenanceStore.openForm();
    const ms = useMaintenanceEventStore.getState();
    ms.setField("eventStart", clampedStart);
    ms.setField("eventEnd", clampedEnd);
    ms.setField("bleacherUuids", [bleacherUuid]);
    if (subrentalConstraint) {
      ms.setField("subrentalConstraint", subrentalConstraint);
    }

    // Set current user as owner
    const clerkId = user?.id;
    if (clerkId) {
      const match = users.find((u) => u.clerk_user_id === clerkId);
      if (match) ms.setField("ownerUserUuid", match.id);
    }

    // Close the cell editor
    handleClose();
  };

  const handleCreateSubRental = () => {
    if (!date || !bleacherUuid) {
      createErrorToast(["Failed to create sub-rental request. Missing date or bleacher id."]);
      return;
    }

    const subrentalStore = useSubrentalEventStore.getState();

    // Calculate end date (7 days after start date)
    const startDate = new Date(date);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    // Format dates as YYYY-MM-DD
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    // Open the subrental form (resets to initial state) then prefill
    subrentalStore.openForm();
    const ss = useSubrentalEventStore.getState();
    ss.setField("eventStart", formatDate(startDate));
    ss.setField("eventEnd", formatDate(endDate));
    ss.setField("bleacherUuid", bleacherUuid);

    // Set current user as creator
    const clerkId = user?.id;
    if (clerkId) {
      const match = users.find((u) => u.clerk_user_id === clerkId);
      if (match) ss.setField("createdByUserUuid", match.id);
    }

    // Close the cell editor
    handleClose();
  };

  // Track whether the initial mousedown began on the backdrop so we only close when both down & up occur there
  const mouseDownOnBackdrop = useRef(false);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownOnBackdrop.current = e.target === e.currentTarget; // only true if directly on backdrop
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
      handleClose();
    }
    mouseDownOnBackdrop.current = false;
  };

  const handleClose = () => {
    setViewingDamageReport(null);
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div
      // onMouseDown={handleClose}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      className="fixed inset-0 z-[1000] bg-black/30 backdrop-blur-xs flex items-center justify-center"
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="bg-white p-4 rounded shadow w-[400px]"
      >
        <div className="flex flex-row justify-between items-start mb-4">
          <h2 className="text-sm font-semibold">Edit Cell</h2>
          <X
            className="-mt-1 cursor-pointer text-gray-300 hover:text-black hover:drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] transition-all duration-200"
            onClick={handleClose}
          />
        </div>

        <textarea
          ref={textareaRef}
          className={`w-full text-sm border p-2 rounded mb-4 ${!canEditCell ? "bg-gray-50 text-gray-700" : ""}`}
          value={currentText}
          onChange={(e) => setCurrentText(e.target.value)}
          readOnly={!canEditCell}
          onKeyDown={(e) => {
            if (!canEditCell) {
              if (e.key === "Escape") {
                e.preventDefault();
                handleClose();
              }
              return;
            }
            const isModifier = e.shiftKey || e.metaKey || e.ctrlKey || e.altKey;

            if (e.key === "Enter" && !isModifier) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              handleClose();
            }
          }}
          rows={4}
          placeholder="Enter block text..."
        />

        <div className="flex justify-between gap-2">
          {/* Left group: damage-report view (all roles) + edit actions (non-viewers) */}
          <div className="flex gap-1">
            {openDamageReport && (
              <AppTooltip content="View Damage Report">
                <button
                  aria-label="View Damage Report"
                  className="flex items-center justify-center h-8 w-8 rounded text-red-600 cursor-pointer hover:text-red-800 hover:bg-red-50 transition-all duration-200"
                  onClick={handleViewDamageReport}
                >
                  <ShieldAlert className="h-4 w-4" />
                </button>
              </AppTooltip>
            )}
            {!isViewer && (
              <>
                <AppTooltip content="Work Tracker">
                  <button
                    aria-label="Work Tracker"
                    className="flex items-center justify-center h-8 w-8 rounded text-gray-500 cursor-pointer hover:text-black hover:bg-gray-100 transition-all duration-200"
                    onClick={handleOpenWorkTracker}
                  >
                    <Truck className="h-4 w-4" />
                  </button>
                </AppTooltip>
                <AppTooltip content="Create Event">
                  <button
                    aria-label="Create Event"
                    className="flex items-center justify-center h-8 w-8 rounded text-gray-500 cursor-pointer hover:text-black hover:bg-gray-100 transition-all duration-200"
                    onClick={handleCreateEvent}
                  >
                    <CalendarPlus className="h-4 w-4" />
                  </button>
                </AppTooltip>
                <AppTooltip content="Maintenance">
                  <button
                    aria-label="Maintenance"
                    className="flex items-center justify-center h-8 w-8 rounded text-gray-500 cursor-pointer hover:text-red-700 hover:bg-gray-100 transition-all duration-200"
                    onClick={handleCreateMaintenance}
                  >
                    <Wrench className="h-4 w-4" />
                  </button>
                </AppTooltip>
                <AppTooltip content="Create Sub-Rental">
                  <button
                    aria-label="Create Sub-Rental"
                    className="flex items-center justify-center h-8 w-8 rounded text-gray-500 cursor-pointer hover:bg-gray-100 transition-all duration-200"
                    style={handshakeHover ? { color: subrentalHexColor } : undefined}
                    onMouseEnter={() => setHandshakeHover(true)}
                    onMouseLeave={() => setHandshakeHover(false)}
                    onClick={handleCreateSubRental}
                  >
                    <Handshake className="h-4 w-4" />
                  </button>
                </AppTooltip>
              </>
            )}
          </div>

          {canEditCell && (
            <div className="flex gap-2">
              {blockUuid && (
                <button
                  className="flex items-center gap-1 text-sm text-gray-500 px-3 py-1 rounded bg-gray-200 cursor-pointer hover:bg-red-900/20 hover:text-red-700 hover:border-red-700 border-1 border-gray-200 transition-all duration-200"
                  onClick={handleDelete}
                >
                  <Trash className="h-4 w-4" />
                  Delete
                </button>
              )}
              <button
                className="flex items-center gap-1 text-sm px-3 py-1 rounded bg-darkBlue text-white cursor-pointer hover:bg-lightBlue transition-all duration-200"
                onClick={handleSave}
              >
                <Check className="h-4 w-4" />
                Save
              </button>
            </div>
          )}
        </div>
      </div>

      {viewingDamageReport && (
        <DamageReportModal
          open={!!viewingDamageReport}
          onOpenChange={(open) => {
            if (!open) setViewingDamageReport(null);
          }}
          onSaved={() => setViewingDamageReport(null)}
          editReport={viewingDamageReport}
        />
      )}
    </div>
  );
}
