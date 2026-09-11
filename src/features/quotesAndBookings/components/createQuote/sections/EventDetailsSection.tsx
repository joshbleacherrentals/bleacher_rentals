"use client";

import { useMemo } from "react";
import { useCreateQuoteStore } from "../../../state/useCreateQuoteStore";
import { useEventTypes } from "../../../hooks/useEventTypes";
import { Dropdown } from "@/components/DropDown";
import { VenuePicker, type VenuePickerValue } from "@/components/VenuePicker";

export function EventDetailsSection() {
  const eventName = useCreateQuoteStore((s) => s.eventName);
  const eventTypeId = useCreateQuoteStore((s) => s.eventTypeId);
  const eventAddressData = useCreateQuoteStore((s) => s.eventAddressData);
  const venueId = useCreateQuoteStore((s) => s.venueId);
  const venueName = useCreateQuoteStore((s) => s.venueName);
  const eventStart = useCreateQuoteStore((s) => s.eventStart);
  const eventEnd = useCreateQuoteStore((s) => s.eventEnd);
  const setField = useCreateQuoteStore((s) => s.setField);

  const venuePickerValue: VenuePickerValue =
    venueId && eventAddressData
      ? { mode: "venue", venueId, name: venueName, address: eventAddressData }
      : eventAddressData
        ? { mode: "manual", venueId: null, address: eventAddressData }
        : { mode: "empty", venueId: null, address: null };

  const handleVenueChange = (value: VenuePickerValue) => {
    if (value.mode === "venue") {
      setField("venueId", value.venueId);
      setField("venueName", value.name);
      setField("eventAddress", value.address.street);
      setField("eventAddressData", value.address);
    } else if (value.mode === "manual") {
      // Detach — see docs/specs/venue-history.md §2.3/§3.1.
      setField("venueId", null);
      setField("venueName", "");
      setField("eventAddress", value.address.street);
      setField("eventAddressData", value.address);
    } else {
      setField("venueId", null);
      setField("venueName", "");
      setField("eventAddress", "");
      setField("eventAddressData", null);
    }
  };

  const { eventTypes } = useEventTypes();

  const eventTypeOptions = eventTypes.map((et) => ({ label: et.name, value: et.id }));

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  return (
    <section>
      <h2 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">
        Event Details
      </h2>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Event Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={eventName}
          onChange={(e) => setField("eventName", e.target.value)}
          placeholder="Stadium Concert 2024"
          className="w-full h-[40px] px-3 border rounded text-sm"
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Event Type <span className="text-red-500">*</span>
        </label>
        <Dropdown
          options={eventTypeOptions}
          selected={eventTypeId}
          onSelect={(val) => setField("eventTypeId", val)}
          placeholder="Select event type"
        />
      </div>
      <div className="mb-4">
        <VenuePicker value={venuePickerValue} onChange={handleVenueChange} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Event Start <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={eventStart}
            min={today}
            onChange={(e) => {
              const val = e.target.value;
              setField("eventStart", val);
              if (eventEnd && val && eventEnd < val) {
                setField("eventEnd", val);
              }
            }}
            className="w-full h-[40px] px-3 border rounded text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Event End <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={eventEnd}
            min={eventStart || today}
            onChange={(e) => setField("eventEnd", e.target.value)}
            className="w-full h-[40px] px-3 border rounded text-sm"
          />
        </div>
      </div>
    </section>
  );
}
