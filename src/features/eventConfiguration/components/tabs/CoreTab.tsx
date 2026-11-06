"use client";
import { Toggle } from "../../../../components/Toggle";
import React from "react";
import { usePsUsers } from "@/features/dashboard/db/hooks/powersync/usePsUsers";
import { VenuePicker, type VenuePickerValue } from "@/components/VenuePicker";
import { Dropdown } from "@/components/DropDown";
import { useCurrentEventStore } from "../../state/useCurrentEventStore";
import { useScrollToDateStore } from "@/features/dashboard/state/useScrollToDateStore";
import { LocateFixed } from "lucide-react";

type Props = {
  showSetupTeardown: boolean;
};

const noop = () => {};

// Every field below is read-only (docs/specs/dashboard-events-read-only.md §3.3): it is on screen,
// greyed, and takes no input. The two "locate" buttons are not fields — they only scroll the grid —
// so they stay enabled for every role (D10).
const FIELD_CLASS =
  "bg-white w-full p-2 border rounded disabled:bg-gray-50 disabled:text-gray-700 disabled:cursor-default";

export const CoreTab = ({ showSetupTeardown }: Props) => {
  const currentEventStore = useCurrentEventStore();
  const users = usePsUsers();

  const { addressData, venueUuid, venueName } = currentEventStore;
  const venuePickerValue: VenuePickerValue =
    venueUuid && addressData
      ? {
          mode: "venue",
          venueId: venueUuid,
          name: venueName,
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

  // Read-only: every user is listed, deactivated ones too, so the owner's name always shows.
  const ownerOptions = users.map((u) => ({
    label: `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || u.id,
    value: String(u.id),
  }));

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
          className={FIELD_CLASS}
          placeholder="Enter event name"
          value={currentEventStore.eventName}
          disabled
        />
        {/* A fieldset locks the picker's search, create and edit buttons in one go. */}
        <fieldset disabled className="m-0 min-w-0 border-0 p-0">
          <VenuePicker
            value={venuePickerValue}
            onChange={noop}
            required
            className="mt-1"
            currentEventId={currentEventStore.eventUuid}
          />
        </fieldset>
      </div>
      <div>
        <label className="block text-sm font-medium text-black/70 mb-1">Event Start</label>
        <div className="flex gap-1">
          <input
            type="date"
            className={`${FIELD_CLASS} min-w-0`}
            value={currentEventStore.eventStart}
            disabled
          />
          <ScrollToDateButton date={currentEventStore.eventStart} />
        </div>
        <label className="block text-sm font-medium text-black/70 mt-1">Event End</label>
        <div className="flex gap-1">
          <input
            type="date"
            className={`${FIELD_CLASS} min-w-0`}
            value={currentEventStore.eventEnd}
            disabled
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
                className={`${FIELD_CLASS} flex-1 ${
                  currentEventStore.sameDaySetup ? "bg-gray-100 text-gray-100" : ""
                }`}
                value={currentEventStore.setupStart}
                disabled
              />
            </div>
            <Toggle
              label="Same-Day"
              tooltip={false}
              checked={currentEventStore.sameDaySetup}
              onChange={noop}
              disabled
            />
          </div>
          <div className="flex gap-4 mt-1">
            <div className="flex-1">
              <label className="block text-sm font-medium text-black/70 flex-1">Teardown End</label>
              <input
                type="date"
                className={`${FIELD_CLASS} flex-1 ${
                  currentEventStore.sameDayTeardown ? "bg-gray-100 text-gray-100" : ""
                }`}
                value={currentEventStore.teardownEnd ?? ""}
                disabled
              />
            </div>
            <div className="mt-5 mr-6">
              <Toggle
                label=""
                tooltip={false}
                checked={currentEventStore.sameDayTeardown}
                onChange={noop}
                disabled
              />
            </div>
          </div>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-black/70 mb-1">Good Shuffle</label>
        <input
          type="text"
          className={FIELD_CLASS}
          placeholder="Enter goodshuffle url"
          value={currentEventStore.goodshuffleUrl ?? ""}
          disabled
        />
        <label className="block text-sm font-medium text-black/70 mt-1">Owner</label>
        <div data-testid="event-owner-select">
          <Dropdown
            options={ownerOptions}
            selected={
              currentEventStore.ownerUserUuid ? String(currentEventStore.ownerUserUuid) : undefined
            }
            onSelect={noop}
            placeholder="Select owner"
            disabled
          />
        </div>
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
