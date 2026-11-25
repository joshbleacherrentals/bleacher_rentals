"use client";

import { Check, Trash, Truck, X, Wrench, Handshake, ShieldAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSelectedBlockStore } from "../state/useSelectedBlock";
import { Tables } from "../../../../database.types";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useQueryClient } from "@tanstack/react-query";
import { deleteBlock, saveBlock } from "../db/client/db";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useRepairWindowsStore } from "@/features/repairs/state/useRepairWindowsStore";
import { cellRepairDates } from "@/features/repairs/utils/newRepairPreset";
import { useUser } from "@clerk/nextjs";
import { usePsUsers } from "@/features/dashboard/db/hooks/powersync/usePsUsers";
import { AppTooltip } from "@/components/AppTooltip";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useDashboardBleachersStore } from "../state/useDashboardBleachersStore";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
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
  const {
    isOpen,
    key,
    blockUuid,
    createdByUserUuid,
    bleacherUuid,
    date,
    text,
    workTrackerUuid,
    setField,
    resetForm,
  } = useSelectedBlockStore();

  // ── Permissions: determine if user can edit this cell ──
  const perms = usePermissionsStore();
  const dashBleachers = useDashboardBleachersStore((s) => s.data);
  const isViewer = !perms.isAdmin && !perms.isAccountManager;
  // The maintenance icon opens the New repair window, so it follows who writes repairs: an
  // administrator and a maintainer, on every cell (docs/specs/repairs-11-dashboard.md D218, D231).
  const canCreateRepair = canManageDamageAndMaintenance({
    isAdmin: perms.isAdmin,
    isMaintainer: perms.isMaintainer,
  });
  const bl = dashBleachers.find((b) => b.bleacherUuid === bleacherUuid) ?? null;
  const canEditCell = canEditCellFn({
    isAdmin: perms.isAdmin,
    isAccountManager: perms.isAccountManager,
    accountManagerZoneIds: perms.accountManagerZoneIds,
    bleacherUuid,
    bleacher: bl ? { zoneUuid: bl.zoneUuid } : null,
    // A maintainer edits an empty cell, or a note they wrote (docs/specs/maintainer-dashboard-cells.md).
    isMaintainer: perms.isMaintainer,
    currentUserUuid: perms.userId,
    block: blockUuid ? { createdByUserUuid } : null,
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

  // The days a repair started from this cell gets: the clicked day, seven days later, cut by the
  // accepted sub-rentals of the bleacher (docs/specs/repairs-11-dashboard.md §2.4, D216). The
  // maintenance icon and "Create Maintenance to Resolve" on the card of a report both use them (D236).
  // The blocks come from the original row of the bleacher: when a zone filter shows only its
  // sub-rental row, they still come from the original one.
  const original = dashBleachers.find((b) => b.bleacherUuid === bleacherUuid && !b.isSubrentalRow);
  const cellDays =
    date && bleacherUuid
      ? cellRepairDates(date, original?.acceptedSubrentalBlocks ?? [])
      : undefined;

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

  // The icon of a cell opens the New repair window with the bleacher and the days of the cell
  // (D216). The checks the form had for an account manager went with their right to write.
  const handleCreateMaintenance = () => {
    if (!date || !bleacherUuid || !cellDays) {
      createErrorToast(["Failed to create maintenance event. Missing date or bleacher id."]);
      return;
    }

    useRepairWindowsStore.getState().open({
      kind: "new",
      preset: { ...cellDays, bleacherUuid },
    });

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
              <AppTooltip content="Work Tracker">
                <button
                  aria-label="Work Tracker"
                  className="flex items-center justify-center h-8 w-8 rounded text-gray-500 cursor-pointer hover:text-black hover:bg-gray-100 transition-all duration-200"
                  onClick={handleOpenWorkTracker}
                >
                  <Truck className="h-4 w-4" />
                </button>
              </AppTooltip>
            )}
            {canCreateRepair && (
              <AppTooltip content="Maintenance">
                <button
                  aria-label="Maintenance"
                  className="flex items-center justify-center h-8 w-8 rounded text-gray-500 cursor-pointer hover:text-red-700 hover:bg-gray-100 transition-all duration-200"
                  onClick={handleCreateMaintenance}
                >
                  <Wrench className="h-4 w-4" />
                </button>
              </AppTooltip>
            )}
            {!isViewer && (
              <>
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
          repairDays={cellDays}
        />
      )}
    </div>
  );
}
