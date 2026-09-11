"use client";
import { Toggle } from "../../../../components/Toggle";
import React, { useEffect } from "react";
import { VenuePicker, type VenuePickerValue } from "@/components/VenuePicker";
import { useUsersStore } from "@/state/userStore";
import { Dropdown } from "@/components/DropDown";
import { useCurrentEventStore } from "../../state/useCurrentEventStore";
import { useScrollToDateStore } from "@/features/dashboard/state/useScrollToDateStore";
import { LocateFixed } from "lucide-react";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { filterOwnerOptions } from "@/features/userAccess/logic/filterOwnerOptions";
import { STATUSES } from "@/features/manageTeam/constants";
import { useAccountManagerUserIds } from "@/features/userAccess/hooks/useAccountManagerUserIds";
import { useDashboardBleachersStore } from "@/features/dashboard/state/useDashboardBleachersStore";
import {
  laterDate,
  earlierDate,
  useSubrentalBlockBounds,
} from "@/features/dashboard/util/subrentalDateBounds";

type Props = {
  showSetupTeardown: boolean;
  disabled?: boolean;
};

export const CoreTab = ({ showSetupTeardown, disabled = false }: Props) => {
  const currentEventStore = useCurrentEventStore();
  const users = useUsersStore((s) => s.users);
  const permissions = useTeamPermissions();
  const accountManagerUserIds = useAccountManagerUserIds();
  const allBleachers = useDashboardBleachersStore((s) => s.data);

  const { blockDerivedStartMin, blockDerivedEndMax } = useSubrentalBlockBounds(
    currentEventStore.bleacherUuids,
    allBleachers,
    currentEventStore.eventStart,
    currentEventStore.eventEnd,
    currentEventStore.subrentalConstraint,
  );

  const { addressData, venueUuid } = currentEventStore;
  const venuePickerValue: VenuePickerValue =
    venueUuid && addressData
      ? {
          mode: "venue",
          venueId: venueUuid,
          name: "", // unused by VenuePicker's own rendering; see docs/specs/venue-history.md §2.3
          address: {
            street: addressData.address,
            city: addressData.city ?? "",
            stateProvince: addressData.state ?? "",
            zipPostal: addressData.postalCode ?? "",
            lat: addressData.lat,
            lng: addressData.lng,
            placeId: addressData.placeId,
            country: addressData.country,
          },
        }
      : addressData
        ? {
            mode: "manual",
            venueId: null,
            address: {
              street: addressData.address,
              city: addressData.city ?? "",
              stateProvince: addressData.state ?? "",
              zipPostal: addressData.postalCode ?? "",
              lat: addressData.lat,
              lng: addressData.lng,
              placeId: addressData.placeId,
              country: addressData.country,
            },
          }
        : { mode: "empty", venueId: null, address: null };

  const handleVenueChange = (value: VenuePickerValue) => {
    if (value.mode === "empty") {
      currentEventStore.setField("venueUuid", null);
      currentEventStore.setField("addressData", null);
      return;
    }
    // "venue" mode: picked an existing/new Venue. "manual" mode: address
    // hand-edited — detaches from whatever venue was previously set (see
    // docs/specs/venue-history.md §3.5). When detaching, the carried-over
    // addressUuid must NOT be reused: if this event was linked to a Venue,
    // that id is the Venue's own shared Addresses row (see §0.1/§4)  —
    // updateEvent.ts would otherwise mutate it in place for every other
    // event still linked to that Venue. Forcing addressUuid to null makes
    // it insert a brand-new private row instead.
    const wasLinkedToVenue = Boolean(currentEventStore.venueUuid);
    currentEventStore.setField("venueUuid", value.mode === "venue" ? value.venueId : null);
    currentEventStore.setField("addressData", {
      addressUuid:
        value.mode === "venue" || wasLinkedToVenue
          ? null
          : (currentEventStore.addressData?.addressUuid ?? null),
      address: value.address.street,
      city: value.address.city,
      state: value.address.stateProvince,
      postalCode: value.address.zipPostal,
      lat: value.address.lat,
      lng: value.address.lng,
      placeId: value.address.placeId,
      country: value.address.country,
    });
  };

  const filteredUsers = filterOwnerOptions({
    users,
    isAdmin: permissions.isAdmin,
    currentUserId: permissions.userId,
    disabled,
    accountManagerUserIds,
    inactiveStatusUuid: STATUSES.inactive,
    existingOwnerId: currentEventStore.originalOwnerUserUuid,
  });
  const ownerOptions = filteredUsers.map((u) => ({
    label: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email,
    value: String(u.id),
  }));

  // Ensure ownerUserId defaults when users load and it's still null
  useEffect(() => {
    // Only auto-fill for brand new unsaved events where user has just opened the form.
    if (
      currentEventStore.isFormExpanded &&
      currentEventStore.eventUuid === null &&
      !currentEventStore.ownerUserUuid &&
      users.length > 0
    ) {
      currentEventStore.setField("ownerUserUuid", users[0].id);
    }
  }, [
    users,
    currentEventStore.ownerUserUuid,
    currentEventStore.eventUuid,
    currentEventStore.isFormExpanded,
  ]);

  // Helper to clamp or auto-adjust invalid dates
  useEffect(() => {
    const s = currentEventStore;

    const oneDayBefore = (dateStr: string) => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() - 1);
      return d.toISOString().split("T")[0];
    };

    const oneDayAfter = (dateStr: string) => {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + 1);
      return d.toISOString().split("T")[0];
    };

    // 1. Auto-set setupStart the first time eventStart is set
    if (s.eventStart && !s.setupStart) {
      s.setField("setupStart", oneDayBefore(s.eventStart));
    }

    // 2. Sync eventEnd with eventStart if it's too early
    if (s.eventStart && s.eventEnd && s.eventStart > s.eventEnd) {
      s.setField("eventEnd", s.eventStart);
    }

    // 3. Sync eventStart with eventEnd if it's too late
    if (s.eventStart && s.eventEnd && s.eventEnd < s.eventStart) {
      s.setField("eventStart", s.eventEnd);
    }

    // 4. Setup must be before eventStart
    if (s.setupStart && s.eventStart && s.setupStart >= s.eventStart) {
      s.setField("setupStart", oneDayBefore(s.eventStart));
    }

    // 5. Teardown must be after eventEnd
    if (s.teardownEnd && s.eventEnd && s.teardownEnd <= s.eventEnd) {
      s.setField("teardownEnd", oneDayAfter(s.eventEnd));
    }
  }, [
    currentEventStore.eventStart,
    currentEventStore.eventEnd,
    currentEventStore.setupStart,
    currentEventStore.teardownEnd,
  ]);

  return (
    <div
      className={`grid ${
        showSetupTeardown ? "grid-cols-[1fr_1fr_1fr_1fr]" : "grid-cols-[1fr_1fr_1fr]"
      } gap-4`}
    >
      <div>
        <label className="block text-sm font-medium text-black/70 mb-1">Event Name</label>
        <input
          type="text"
          className="bg-white w-full p-2 border rounded"
          placeholder="Enter event name"
          value={currentEventStore.eventName}
          onChange={(e) => currentEventStore.setField("eventName", e.target.value)}
        />
        <VenuePicker
          value={venuePickerValue}
          onChange={handleVenueChange}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-black/70 mb-1">Event Start</label>
        <div className="flex gap-1">
          <input
            type="date"
            className="bg-white w-full p-2 border rounded min-w-0"
            value={currentEventStore.eventStart}
            onChange={(e) => currentEventStore.setField("eventStart", e.target.value)}
            min={laterDate(
              currentEventStore.subrentalConstraint?.eventStart || undefined,
              blockDerivedStartMin,
            )}
            max={earlierDate(
              currentEventStore.subrentalConstraint
                ? currentEventStore.subrentalConstraint.eventEnd
                : currentEventStore.eventEnd || undefined,
              blockDerivedEndMax,
            )}
          />
          <ScrollToDateButton date={currentEventStore.eventStart} />
        </div>
        <label className="block text-sm font-medium text-black/70 mt-1">Event End</label>
        <div className="flex gap-1">
          <input
            type="date"
            className="bg-white w-full p-2 border rounded min-w-0"
            value={currentEventStore.eventEnd}
            onChange={(e) => currentEventStore.setField("eventEnd", e.target.value)}
            min={laterDate(
              currentEventStore.subrentalConstraint
                ? currentEventStore.subrentalConstraint.eventStart
                : currentEventStore.eventStart || undefined,
              blockDerivedStartMin,
            )}
            max={earlierDate(
              currentEventStore.subrentalConstraint?.eventEnd || undefined,
              blockDerivedEndMax,
            )}
          />
          <ScrollToDateButton date={currentEventStore.eventEnd} />
        </div>
      </div>
      {showSetupTeardown && (
        <div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-black/70 mb-1 flex-1 ">
                Setup Start
              </label>
              <input
                type="date"
                className={`bg-white w-full p-2 border rounded flex-1 ${
                  currentEventStore.sameDaySetup
                    ? "bg-gray-100 text-gray-100 cursor-not-allowed"
                    : ""
                }`}
                value={currentEventStore.setupStart}
                onChange={(e) => currentEventStore.setField("setupStart", e.target.value)}
                disabled={currentEventStore.sameDaySetup}
                max={
                  currentEventStore.eventStart
                    ? new Date(new Date(currentEventStore.eventStart).getTime() - 86400000) // 1 day before
                        .toISOString()
                        .split("T")[0]
                    : undefined
                }
              />
            </div>
            <Toggle
              label="Same-Day"
              tooltip={false}
              checked={currentEventStore.sameDaySetup}
              onChange={(e) => currentEventStore.setField("sameDaySetup", e)}
            />
          </div>
          <div className="flex gap-4 mt-1">
            <div className="flex-1">
              <label className="block text-sm font-medium text-black/70 flex-1">Teardown End</label>
              <input
                type="date"
                className={`bg-white w-full p-2 border rounded flex-1 ${
                  currentEventStore.sameDayTeardown
                    ? "bg-gray-100 text-gray-100 cursor-not-allowed"
                    : ""
                }`}
                value={currentEventStore.teardownEnd ?? ""}
                onChange={(e) => currentEventStore.setField("teardownEnd", e.target.value)}
                disabled={currentEventStore.sameDayTeardown}
                min={
                  currentEventStore.eventEnd
                    ? new Date(new Date(currentEventStore.eventEnd).getTime() + 86400000) // 1 day after
                        .toISOString()
                        .split("T")[0]
                    : undefined
                }
              />
            </div>
            <div className="mt-5 mr-6">
              <Toggle
                label=""
                tooltip={false}
                checked={currentEventStore.sameDayTeardown}
                onChange={(e) => currentEventStore.setField("sameDayTeardown", e)}
              />
            </div>
          </div>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-black/70 mb-1">Good Shuffle</label>
        <input
          type="text"
          className="bg-white w-full p-2 border rounded"
          placeholder="Enter goodshuffle url"
          value={currentEventStore.goodshuffleUrl ?? ""}
          onChange={(e) => currentEventStore.setField("goodshuffleUrl", e.target.value)}
        />
        <label className="block text-sm font-medium text-black/70 mt-1">Owner</label>
        <Dropdown
          options={ownerOptions}
          selected={
            currentEventStore.ownerUserUuid ? String(currentEventStore.ownerUserUuid) : undefined
          }
          onSelect={(val) => {
            if (!val) {
              currentEventStore.setField("ownerUserUuid", null);
            } else {
              currentEventStore.setField("ownerUserUuid", val as string);
            }
          }}
          placeholder="Select owner"
          disabled={disabled}
        />
      </div>
    </div>
  );
};

function ScrollToDateButton({ date }: { date: string }) {
  const scrollToDate = useScrollToDateStore((s) => s.scrollToDate);
  return (
    <button
      type="button"
      className="shrink-0 p-2  text-black/50 hover:text-black disabled:opacity-30 disabled:cursor-not-allowed"
      disabled={!date || !scrollToDate}
      onClick={() => scrollToDate?.(date)}
      title="Scroll dashboard to this date"
    >
      <LocateFixed size={16} />
    </button>
  );
}
