"use client";

import { useState } from "react";
import AddressAutocomplete from "./AddressAutoComplete";
import { TextField, FIELD_LABEL } from "./form/TextField";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { EntitySearchSelect } from "./EntitySearchSelect";
import { useVenuesAll } from "@/features/venues/hooks/useVenuesAll";
import { createVenue } from "@/features/venues/db/createVenue";
import { updateVenue } from "@/features/venues/db/updateVenue";
import { deleteVenue } from "@/features/venues/db/deleteVenue";
import { countEventsForVenue } from "@/features/venues/db/countEventsForVenue";
import { findDuplicateVenue } from "@/features/venues/logic/findDuplicateVenue";
import { venueAddressKey } from "@/features/venues/logic/venueAddressKey";
import type { VenueAddressFields, VenueFull, VenuePickerValue } from "@/features/venues/types";

export type { VenuePickerValue } from "@/features/venues/types";

export function venueAddressLine(address: VenueAddressFields): string {
  return [address.street, address.city, address.stateProvince, address.zipPostal]
    .filter(Boolean)
    .join(", ");
}

type VenuePickerProps = {
  value: VenuePickerValue;
  onChange: (value: VenuePickerValue) => void;
  required?: boolean;
  className?: string;
  /**
   * The event this picker belongs to, if it already exists — excluded from
   * the "this affects N other events" count when editing a venue's own
   * record. Omit for a not-yet-saved event / a picker with no event context
   * (e.g. a contact's default venue).
   */
  currentEventId?: string | null;
};

// Includes the zip/postal — this is what actually goes back into the
// address input as its `initialValue`, which must match what
// AddressAutocomplete itself formats a fresh selection as, or its
// prop-driven reset effect overwrites the field back down to less than
// what was just picked.
function addressInputValue(address: VenueAddressFields): string {
  return [address.street, address.city, address.stateProvince, address.zipPostal]
    .filter(Boolean)
    .join(", ");
}

function toAddressFields(data: {
  address: string;
  city?: string;
  state?: string;
  postalCode?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
  country?: string;
  businessName?: string;
}): VenueAddressFields {
  return {
    street: data.address,
    city: data.city ?? "",
    stateProvince: data.state ?? "",
    zipPostal: data.postalCode ?? "",
    lat: data.lat,
    lng: data.lng,
    placeId: data.placeId,
    country: data.country,
  };
}

function DuplicateNotice({ venue, onUseInstead }: { venue: VenueFull; onUseInstead: () => void }) {
  return (
    <div className="text-xs bg-amber-50 border border-amber-200 rounded-md p-2 space-y-1.5">
      <p className="text-amber-800">
        A venue already exists at this address: <span className="font-semibold">{venue.name}</span>
      </p>
      <button
        type="button"
        onClick={onUseInstead}
        className="font-medium text-darkBlue hover:underline"
      >
        Use this venue instead
      </button>
    </div>
  );
}

/**
 * Search-existing / create-new / edit-in-place venue picker. See
 * docs/specs/venue-history.md §2.3 for the mode contract this reads and
 * writes. EntitySearchSelect is the only inline element — search, "+ Create
 * New Venue" and the pencil-edit affordance (reachable on any row, not
 * just the current selection) all live in small modals opened from it.
 */
export function VenuePicker({
  value,
  onChange,
  required,
  className,
  currentEventId,
}: VenuePickerProps) {
  const { venues } = useVenuesAll();
  const selected: VenueFull | null =
    value.mode === "venue" ? { id: value.venueId, name: value.name, address: value.address } : null;

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createAddress, setCreateAddress] = useState<VenueAddressFields | null>(null);
  // What was typed in the search field before hitting "+ Create New
  // Venue" — seeds the Address field (with live suggestions) instead of
  // the Name field, since what's typed there is almost always the venue's
  // location, not necessarily its name.
  const [createAddressSeed, setCreateAddressSeed] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [createDuplicate, setCreateDuplicate] = useState<VenueFull | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  // Confirming a save or a delete is just another view inside this same
  // Dialog, not a second overlay — two Radix roots open together was
  // repeatedly leaving the page's scroll lock stuck with no way to click
  // or scroll until a reload. Only one root is ever open now.
  const [editStep, setEditStep] = useState<"form" | "confirmSave" | "confirmDelete">("form");
  // The venue being edited — reachable from a dropdown row, not only the
  // current selection, so this is tracked independently of `value`.
  const [editingVenueId, setEditingVenueId] = useState<string | null>(null);
  const [editOriginal, setEditOriginal] = useState<{
    name: string;
    address: VenueAddressFields;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState<VenueAddressFields | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editDuplicate, setEditDuplicate] = useState<VenueFull | null>(null);
  const [affectedEventCount, setAffectedEventCount] = useState(0);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const openCreate = (query: string) => {
    setCreateName("");
    setCreateAddress(null);
    setCreateDuplicate(null);
    setCreateAddressSeed(query);
    setCreateOpen(true);
  };

  const handleSaveNewVenue = async () => {
    if (!createName.trim() || !createAddress) return;
    const dup = findDuplicateVenue(venues, createAddress);
    if (dup) {
      setCreateDuplicate(dup);
      return;
    }
    setCreateSaving(true);
    try {
      const venue = await createVenue({ name: createName.trim(), address: createAddress });
      onChange({ mode: "venue", venueId: venue.id, name: venue.name, address: venue.address });
      setCreateOpen(false);
    } finally {
      setCreateSaving(false);
    }
  };

  const useCreateDuplicate = () => {
    if (!createDuplicate) return;
    onChange({
      mode: "venue",
      venueId: createDuplicate.id,
      name: createDuplicate.name,
      address: createDuplicate.address,
    });
    setCreateOpen(false);
  };

  const openEdit = (venueId: string) => {
    const venue = venues.find((v) => v.id === venueId);
    if (!venue) return;
    setEditingVenueId(venueId);
    setEditOriginal({ name: venue.name, address: venue.address });
    setEditName(venue.name);
    setEditAddress(venue.address);
    setEditDuplicate(null);
    setEditStep("form");
    setEditOpen(true);
  };

  const requestSaveVenueEdit = async () => {
    if (!editingVenueId || !editName.trim() || !editAddress) return;
    const dup = findDuplicateVenue(venues, editAddress, editingVenueId);
    if (dup) {
      setEditDuplicate(dup);
      return;
    }
    // Editing in place with the exact same address key is a no-op for the
    // duplicate check but still worth skipping the "N other events" prompt
    // if nothing about the address actually changed and only the name did —
    // still counts as a real edit, so always check.
    const count = await countEventsForVenue(editingVenueId, currentEventId);
    if (count > 0) {
      setAffectedEventCount(count);
      setEditStep("confirmSave");
    } else {
      await commitVenueEdit();
    }
  };

  const commitVenueEdit = async () => {
    if (!editingVenueId || !editName.trim() || !editAddress) return;
    setEditSaving(true);
    try {
      await updateVenue(editingVenueId, { name: editName.trim(), address: editAddress });
      // Editing a venue always selects it, whether it was reached from the
      // current selection's own pencil or from a dropdown row — see the
      // spec discussion this component's design came out of.
      onChange({
        mode: "venue",
        venueId: editingVenueId,
        name: editName.trim(),
        address: editAddress,
      });
      setEditOpen(false);
    } finally {
      setEditSaving(false);
    }
  };

  const requestDeleteVenue = async () => {
    if (!editingVenueId) return;
    // Always confirm — it's destructive — but the count tailors what the
    // confirmation actually says (see the copy below).
    const count = await countEventsForVenue(editingVenueId, currentEventId);
    setAffectedEventCount(count);
    setEditStep("confirmDelete");
  };

  const commitDeleteVenue = async () => {
    if (!editingVenueId) return;
    setDeleteSaving(true);
    try {
      await deleteVenue(editingVenueId);
      // Only clear the current selection if the venue just deleted is the
      // one actually selected — deleting some other venue reached from the
      // dropdown shouldn't touch what this field currently has picked.
      if (value.mode === "venue" && value.venueId === editingVenueId) {
        onChange({ mode: "empty", venueId: null, address: null });
      }
      setEditOpen(false);
    } finally {
      setDeleteSaving(false);
    }
  };

  const useEditDuplicate = () => {
    if (!editDuplicate) return;
    onChange({
      mode: "venue",
      venueId: editDuplicate.id,
      name: editDuplicate.name,
      address: editDuplicate.address,
    });
    setEditOpen(false);
  };

  return (
    <div className={className}>
      <label className={FIELD_LABEL}>
        Venue{required && <span className="text-red-500"> *</span>}
      </label>

      <EntitySearchSelect<VenueFull>
        items={venues}
        selected={selected}
        onSelect={(venue) =>
          onChange({ mode: "venue", venueId: venue.id, name: venue.name, address: venue.address })
        }
        onClear={() => onChange({ mode: "empty", venueId: null, address: null })}
        onCreateNew={openCreate}
        onEdit={openEdit}
        renderPrimary={(venue) => venue.name}
        renderSecondary={(venue) => venueAddressLine(venue.address)}
        getSearchText={(venue) => `${venue.name} ${venueAddressLine(venue.address)}`}
        createLabel="+ Create New Venue"
        emptyLabel="No venues found."
        emptyCardLabel="Select venue..."
        placeholder="Search venues..."
      />

      {/* Create New Venue */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Venue</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <TextField
              label="Venue Name"
              value={createName}
              onChange={(v) => {
                setCreateName(v);
                setCreateDuplicate(null);
              }}
              placeholder="Lincoln High School Stadium"
            />
            <div>
              <label className={FIELD_LABEL}>Address</label>
              <AddressAutocomplete
                onAddressSelect={(data) => {
                  setCreateAddress(toAddressFields(data));
                  setCreateDuplicate(null);
                  // Suggestion only — never overwrites a name the user
                  // already typed, and it's a normal text field either way.
                  if (!createName.trim() && data.businessName) {
                    setCreateName(data.businessName);
                  }
                }}
                initialSearchQuery={createAddressSeed}
              />
            </div>
            {createDuplicate && (
              <DuplicateNotice venue={createDuplicate} onUseInstead={useCreateDuplicate} />
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveNewVenue}
              disabled={!createName.trim() || !createAddress || createSaving}
              className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue disabled:opacity-40"
            >
              {createSaving ? "Saving…" : "Save & Select"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Venue — confirming a save or a delete is just another view
          inside this same Dialog, not a second overlay. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          {editStep === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Venue</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <p className="text-xs text-gray-500">
                  This updates the venue everywhere it's used, including other events.
                </p>
                <TextField
                  label="Venue Name"
                  value={editName}
                  onChange={(v) => {
                    setEditName(v);
                    setEditDuplicate(null);
                  }}
                />
                <div>
                  <label className={FIELD_LABEL}>Address</label>
                  <AddressAutocomplete
                    onAddressSelect={(data) => {
                      setEditAddress(toAddressFields(data));
                      setEditDuplicate(null);
                    }}
                    initialValue={editAddress ? addressInputValue(editAddress) : ""}
                  />
                </div>
                {editDuplicate && (
                  <DuplicateNotice venue={editDuplicate} onUseInstead={useEditDuplicate} />
                )}
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={requestDeleteVenue}
                  disabled={editSaving || deleteSaving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40"
                >
                  Delete Venue
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={requestSaveVenueEdit}
                    disabled={
                      !editName.trim() ||
                      !editAddress ||
                      editSaving ||
                      (editOriginal !== null &&
                        editName.trim() === editOriginal.name &&
                        editAddress &&
                        venueAddressKey(editAddress) === venueAddressKey(editOriginal.address))
                    }
                    className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue disabled:opacity-40"
                  >
                    {editSaving ? "Saving…" : "Save Venue"}
                  </button>
                </div>
              </div>
            </>
          )}

          {editStep === "confirmSave" && (
            <>
              <DialogHeader>
                <DialogTitle>Update venue for everyone?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600">
                This will change the name and address for {affectedEventCount}{" "}
                {affectedEventCount === 1 ? "other event" : "other events"} that use this venue, not
                just this one.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditStep("form")}
                  className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitVenueEdit}
                  disabled={editSaving}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue disabled:opacity-40"
                >
                  {editSaving ? "Saving…" : "Update Venue"}
                </button>
              </div>
            </>
          )}

          {editStep === "confirmDelete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete this venue?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600">
                {affectedEventCount > 0
                  ? `This venue is used by ${affectedEventCount} other ${
                      affectedEventCount === 1 ? "event" : "events"
                    }. Deleting it won't change their address — they keep exactly what they have
                      now — but nobody will be able to find or pick this venue for a new event
                      again.`
                  : "It won't be findable or pickable for any event again."}
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditStep("form")}
                  className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitDeleteVenue}
                  disabled={deleteSaving}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-40"
                >
                  {deleteSaving ? "Deleting…" : "Delete Venue"}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
