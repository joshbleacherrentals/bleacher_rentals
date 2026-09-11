"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import AddressAutocomplete from "./AddressAutoComplete";
import { SearchableSelect } from "./SearchableSelect";
import { TextField, FIELD_LABEL } from "./form/TextField";
import { useVenuesAll } from "@/features/venues/hooks/useVenuesAll";
import { createVenue } from "@/features/venues/db/createVenue";
import type { VenueAddressFields } from "@/features/venues/types";

export type VenuePickerValue =
  | { mode: "venue"; venueId: string; name: string; address: VenueAddressFields }
  | { mode: "manual"; venueId: null; address: VenueAddressFields } // detached: address typed/edited directly
  | { mode: "empty"; venueId: null; address: null };

type VenuePickerProps = {
  value: VenuePickerValue;
  onChange: (value: VenuePickerValue) => void;
  required?: boolean;
  className?: string;
};

function fullAddressLabel(address: VenueAddressFields): string {
  return [address.street, address.city, address.stateProvince].filter(Boolean).join(", ");
}

/**
 * See docs/specs/venue-history.md §2.3. Two distinct ways to change what's
 * populated: (1) pick an existing Venue, or create a new one, via the
 * searchable select; (2) edit the address directly, which detaches from
 * whatever venue was selected — the caller (onChange) is what actually
 * writes venue_uuid = null on save, this component only reports the mode.
 */
export function VenuePicker({ value, onChange, required, className }: VenuePickerProps) {
  const { venues, isLoading } = useVenuesAll();
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState<VenueAddressFields | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);

  const venueOptions = venues.map((v) => ({
    label: v.name,
    value: v.id,
    searchValue: fullAddressLabel(v.address),
  }));

  const handleSelectVenue = (id: string | null) => {
    if (!id) {
      onChange({ mode: "empty", venueId: null, address: null });
      return;
    }
    const venue = venues.find((v) => v.id === id);
    if (!venue) return;
    setEditingAddress(false);
    onChange({ mode: "venue", venueId: venue.id, name: venue.name, address: venue.address });
  };

  const handleManualAddressSelect = (data: {
    address: string;
    city?: string;
    state?: string;
    postalCode?: string;
    lat?: number;
    lng?: number;
    placeId?: string;
    country?: string;
  }) => {
    const address: VenueAddressFields = {
      street: data.address,
      city: data.city ?? "",
      stateProvince: data.state ?? "",
      zipPostal: data.postalCode ?? "",
      lat: data.lat,
      lng: data.lng,
      placeId: data.placeId,
      country: data.country,
    };
    onChange({ mode: "manual", venueId: null, address });
  };

  const handleSaveNewVenue = async () => {
    if (!newName.trim() || !newAddress) return;
    setSaving(true);
    try {
      const venue = await createVenue({ name: newName.trim(), address: newAddress });
      onChange({ mode: "venue", venueId: venue.id, name: venue.name, address: venue.address });
      setAddingNew(false);
      setNewName("");
      setNewAddress(null);
    } finally {
      setSaving(false);
    }
  };

  const selectedVenueId = value.mode === "venue" ? value.venueId : null;
  const showManualAddressField = value.mode !== "venue" || editingAddress;

  return (
    <div className={className}>
      <label className={FIELD_LABEL.replace("mb-1.5", "mb-1")}>
        Venue{required && <span className="text-red-500"> *</span>}
      </label>

      <SearchableSelect
        options={venueOptions}
        selected={selectedVenueId}
        onSelect={handleSelectVenue}
        placeholder={isLoading ? "Loading venues..." : "Select venue..."}
        searchPlaceholder="Search by name or address..."
        emptyMessage="No venues found."
        disabled={isLoading}
        footerItem={{ label: "+ Add new venue", onSelect: () => setAddingNew(true) }}
      />

      {addingNew && (
        <div className="mt-2 p-3 border rounded-md bg-gray-50 space-y-2">
          <TextField
            label="Venue Name"
            value={newName}
            onChange={setNewName}
            placeholder="Lincoln High School Stadium"
          />
          <div>
            <label className={FIELD_LABEL}>Address</label>
            <AddressAutocomplete
              onAddressSelect={(data) =>
                setNewAddress({
                  street: data.address,
                  city: data.city ?? "",
                  stateProvince: data.state ?? "",
                  zipPostal: data.postalCode ?? "",
                  lat: data.lat,
                  lng: data.lng,
                  placeId: data.placeId,
                  country: data.country,
                })
              }
              initialValue={newAddress?.street ?? ""}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAddingNew(false);
                setNewName("");
                setNewAddress(null);
              }}
              className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNewVenue}
              disabled={!newName.trim() || !newAddress || saving}
              className="px-3 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Venue"}
            </button>
          </div>
        </div>
      )}

      {value.mode === "venue" && !editingAddress && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500">
          <span>{fullAddressLabel(value.address)}</span>
          <button
            type="button"
            onClick={() => setEditingAddress(true)}
            className="inline-flex items-center gap-1 text-darkBlue hover:underline"
            title="Edit the address for this event only (detaches it from the venue)"
          >
            <Pencil className="w-3 h-3" />
            Edit address for this event
          </button>
        </div>
      )}

      {showManualAddressField && (
        <div className="mt-2">
          <AddressAutocomplete
            onAddressSelect={handleManualAddressSelect}
            initialValue={value.address?.street ?? ""}
          />
        </div>
      )}
    </div>
  );
}
