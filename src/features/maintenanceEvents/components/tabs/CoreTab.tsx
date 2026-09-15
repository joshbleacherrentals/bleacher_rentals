"use client";
import React, { useEffect } from "react";
import AddressAutocomplete from "@/components/AddressAutoComplete";
import { usePsUsers } from "@/features/dashboard/db/hooks/powersync/usePsUsers";
import { Dropdown } from "@/components/DropDown";
import { useMaintenanceEventStore } from "../../state/useMaintenanceEventStore";
import { useScrollToDateStore } from "@/features/dashboard/state/useScrollToDateStore";
import { LocateFixed } from "lucide-react";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { filterOwnerOptions } from "@/features/userAccess/logic/filterOwnerOptions";
import { STATUSES } from "@/features/manageTeam/constants";
import { useAccountManagerUserIds } from "@/features/userAccess/hooks/useAccountManagerUserIds";
import CentsInput from "@/components/CentsInput";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useDashboardBleachersStore } from "@/features/dashboard/state/useDashboardBleachersStore";
import {
  laterDate,
  earlierDate,
  useSubrentalBlockBounds,
} from "@/features/dashboard/util/subrentalDateBounds";

type Props = {
  disabled?: boolean;
};

export const MaintenanceCoreTab = ({ disabled = false }: Props = {}) => {
  const store = useMaintenanceEventStore();
  const supabase = useClerkSupabaseClient();
  const users = usePsUsers();
  const permissions = useTeamPermissions();
  const accountManagerUserIds = useAccountManagerUserIds();
  const filteredUsers = filterOwnerOptions({
    users,
    isAdmin: permissions.isAdmin,
    currentUserId: permissions.userId,
    disabled,
    accountManagerUserIds,
    inactiveStatusUuid: STATUSES.inactive,
  });
  const ownerOptions = filteredUsers.map((u) => ({
    label: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || u.id,
    value: String(u.id),
  }));

  // Default ownerUserUuid when users load
  useEffect(() => {
    if (
      store.isFormExpanded &&
      store.maintenanceEventUuid === null &&
      !store.ownerUserUuid &&
      users.length > 0
    ) {
      store.setField("ownerUserUuid", users[0].id);
    }
  }, [users, store.ownerUserUuid, store.maintenanceEventUuid, store.isFormExpanded]);

  // Clamp dates
  useEffect(() => {
    if (store.eventStart && store.eventEnd && store.eventStart > store.eventEnd) {
      store.setField("eventEnd", store.eventStart);
    }
    if (store.eventStart && store.eventEnd && store.eventEnd < store.eventStart) {
      store.setField("eventStart", store.eventEnd);
    }
  }, [store.eventStart, store.eventEnd]);

  const [costDisplay, setCostDisplay] = React.useState(
    store.costCents !== null ? (store.costCents / 100).toFixed(2) : "",
  );

  useEffect(() => {
    setCostDisplay(store.costCents !== null ? (store.costCents / 100).toFixed(2) : "");
  }, [store.maintenanceEventUuid]);

  const bleacherUuids = store.bleacherUuids;
  const eventStart = store.eventStart;

  const allBleachers = useDashboardBleachersStore((s) => s.data);
  const { blockDerivedStartMin, blockDerivedEndMax } = useSubrentalBlockBounds(
    bleacherUuids,
    allBleachers,
    store.eventStart,
    store.eventEnd,
    store.subrentalConstraint,
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">Event Name</label>
          <input
            type="text"
            className="bg-white w-full p-2 border rounded"
            placeholder="Maintenance / Repair"
            value={store.eventName}
            onChange={(e) => store.setField("eventName", e.target.value)}
          />
          <label className="block mt-1 text-sm font-medium text-black/70">Address</label>
          <AddressAutocomplete
            className="bg-white"
            onAddressSelect={(data) =>
              store.setField("addressData", {
                ...data,
                addressUuid: store.addressData?.addressUuid ?? null,
              })
            }
            initialValue={store.addressData?.address || ""}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">Start Date</label>
          <div className="flex gap-1">
            <input
              type="date"
              className="bg-white w-full p-2 border rounded min-w-0"
              value={store.eventStart}
              onChange={(e) => store.setField("eventStart", e.target.value)}
              min={laterDate(
                store.subrentalConstraint?.eventStart || undefined,
                blockDerivedStartMin,
              )}
              max={earlierDate(
                store.subrentalConstraint
                  ? store.subrentalConstraint.eventEnd
                  : store.eventEnd || undefined,
                blockDerivedEndMax,
              )}
            />
            <ScrollToDateButton date={store.eventStart} />
          </div>
          <label className="block text-sm font-medium text-black/70 mt-1">End Date</label>
          <div className="flex gap-1">
            <input
              type="date"
              className="bg-white w-full p-2 border rounded min-w-0"
              value={store.eventEnd}
              onChange={(e) => store.setField("eventEnd", e.target.value)}
              min={laterDate(
                store.subrentalConstraint
                  ? store.subrentalConstraint.eventStart
                  : store.eventStart || undefined,
                blockDerivedStartMin,
              )}
              max={earlierDate(
                store.subrentalConstraint?.eventEnd || undefined,
                blockDerivedEndMax,
              )}
            />
            <ScrollToDateButton date={store.eventEnd} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">Repair Cost</label>
          <CentsInput
            value={costDisplay}
            onChange={(value, cents) => {
              setCostDisplay(value);
              store.setField("costCents", cents);
            }}
            placeholder="0.00"
            className="bg-white w-full p-2 border rounded"
          />
          <label className="block text-sm font-medium text-black/70 mt-1">Owner</label>
          <Dropdown
            options={ownerOptions}
            selected={store.ownerUserUuid ? String(store.ownerUserUuid) : undefined}
            onSelect={(val) => {
              if (!val) {
                store.setField("ownerUserUuid", null);
              } else {
                store.setField("ownerUserUuid", val as string);
              }
            }}
            placeholder="Select owner"
            disabled={disabled}
          />
        </div>
      </div>
    </>
  );
};

function ScrollToDateButton({ date }: { date: string }) {
  const scrollToDate = useScrollToDateStore((s) => s.scrollToDate);
  return (
    <button
      type="button"
      className="shrink-0 p-2 text-black/50 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
      disabled={!date || !scrollToDate}
      onClick={() => scrollToDate?.(date)}
      title="Scroll dashboard to this date"
    >
      <LocateFixed size={16} />
    </button>
  );
}
