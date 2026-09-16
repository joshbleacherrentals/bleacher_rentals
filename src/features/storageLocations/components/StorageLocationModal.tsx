"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AddressAutocomplete, { formatAddressLine } from "@/components/AddressAutoComplete";
import {
  createStorageLocation,
  updateStorageLocation,
  StorageLocationRow,
  StorageLocationAddress,
} from "../db/storageLocationsDb";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToast } from "@/components/toasts/ErrorToast";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Optional — the page list is reactive, so a manual refetch is not required. */
  onSaved?: () => void;
  /** When set, the modal edits this location; otherwise it creates a new one. */
  editing?: StorageLocationRow | null;
};

export function StorageLocationModal({ open, onClose, onSaved, editing }: Props) {
  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [gateCode, setGateCode] = useState("");
  const [notes, setNotes] = useState("");
  const [address, setAddress] = useState<StorageLocationAddress | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = !!editing;

  // Hydrate fields when opening in edit mode (or reset for create)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name ?? "");
      setContactPhone(editing.contact_phone_number ?? "");
      setGateCode(editing.gate_code ?? "");
      setNotes(editing.notes ?? "");
      setAddress(
        editing.address_street
          ? {
              street: editing.address_street ?? "",
              city: editing.address_city ?? "",
              stateProvince: editing.address_state ?? "",
              zipPostal: editing.address_zip ?? "",
            }
          : null,
      );
    } else {
      setName("");
      setContactPhone("");
      setGateCode("");
      setNotes("");
      setAddress(null);
    }
  }, [open, editing]);

  const resetAndClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        contactPhoneNumber: contactPhone.trim() || null,
        gateCode: gateCode.trim() || null,
        notes: notes.trim() || null,
        address,
      };

      if (isEditing && editing) {
        await updateStorageLocation(editing.id, editing.address_uuid, payload);
        createSuccessToast([`Storage location "${name}" updated.`]);
      } else {
        await createStorageLocation(payload);
        createSuccessToast([`Storage location "${name}" created.`]);
      }
      resetAndClose();
      onSaved?.();
    } catch (e) {
      createErrorToast(["Failed to save storage location.", String(e)]);
    } finally {
      setSaving(false);
    }
  };

  const addressLabel = formatAddressLine({
    street: address?.street,
    city: address?.city,
    state: address?.stateProvince,
    postalCode: address?.zipPostal,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Storage Location" : "Add Storage Location"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="North Yard"
              className="w-full h-[40px] px-3 border rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <AddressAutocomplete
              initialValue={addressLabel}
              onAddressSelect={(data) =>
                setAddress({
                  street: data.address ?? "",
                  city: data.city ?? "",
                  stateProvince: data.state ?? "",
                  zipPostal: data.postalCode ?? "",
                  lat: data.lat,
                  lng: data.lng,
                  placeId: data.placeId,
                  country: data.country,
                })
              }
              className="h-[40px] px-3 border rounded text-sm"
            />
            {address?.city && (
              <p className="text-xs text-gray-500 mt-1">
                {address.city}
                {address.stateProvince ? `, ${address.stateProvince}` : ""}
                {address.zipPostal ? ` ${address.zipPostal}` : ""}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Number</label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full h-[40px] px-3 border rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Gate Code</label>
            <input
              type="text"
              value={gateCode}
              onChange={(e) => setGateCode(e.target.value)}
              placeholder="#1234"
              className="w-full h-[40px] px-3 border rounded text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Access instructions, hours, etc."
              rows={3}
              className="w-full px-3 py-2 border rounded text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-between mt-4">
          <button
            onClick={resetAndClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-darkBlue rounded-sm shadow-md hover:bg-lightBlue transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Location"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
