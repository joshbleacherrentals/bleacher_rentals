"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";
import { Dropdown } from "@/components/DropDown";
import AddressAutocomplete, { formatAddressLine } from "@/components/AddressAutoComplete";
import {
  createSalesOffice,
  updateSalesOffice,
  fetchQboConnections,
  QboConnectionOption,
  SalesOfficeRow,
  SalesOfficeAddress,
} from "../db/salesOfficesDb";
import { useStripeConnections } from "@/features/stripe-integration/hooks/useStripeConnections";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { AutoEmailsForSalesOfficeBtn } from "./AutoEmailsForSalesOfficeBtn";

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** When set, the modal edits this office; otherwise it creates a new one. */
  editing?: SalesOfficeRow | null;
};

export function AddOfficeModal({ open, onClose, onSaved, editing }: Props) {
  const supabase = useClerkSupabaseClient();

  const [name, setName] = useState("");
  const [quickbookUuid, setQuickbookUuid] = useState<string | null>(null);
  const [stripeConnectionUuid, setStripeConnectionUuid] = useState<string | null>(null);
  const [address, setAddress] = useState<SalesOfficeAddress | null>(null);
  const [saving, setSaving] = useState(false);

  const [qboOptions, setQboOptions] = useState<QboConnectionOption[]>([]);
  const [loadingQbo, setLoadingQbo] = useState(false);

  // Active Stripe connections come reactively from PowerSync (unlike QBO, which
  // isn't synced and is fetched above).
  const { connections: stripeConnections, isLoading: loadingStripe } = useStripeConnections({
    showDeleted: false,
  });

  const isEditing = !!editing;

  useEffect(() => {
    if (!open) return;
    setLoadingQbo(true);
    fetchQboConnections(supabase)
      .then(setQboOptions)
      .finally(() => setLoadingQbo(false));
  }, [open, supabase]);

  // Hydrate fields when opening in edit mode (or reset for create)
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name ?? "");
      setQuickbookUuid(editing.quickbook_uuid ?? null);
      setStripeConnectionUuid(editing.stripe_connection_uuid ?? null);
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
      setQuickbookUuid(null);
      setStripeConnectionUuid(null);
      setAddress(null);
    }
  }, [open, editing]);

  const qboDropdownOptions = qboOptions.map((q) => ({
    label: q.displayName,
    value: q.id,
  }));

  // Currency is inherited from the chosen QuickBooks connection.
  const selectedCurrency = quickbookUuid
    ? (qboOptions.find((q) => q.id === quickbookUuid)?.currency ?? null)
    : null;

  // What's still missing for the office to be fully set up.
  const missing = [
    !address?.street && "address",
    !quickbookUuid && "QuickBooks account",
    !stripeConnectionUuid && "Stripe account",
  ].filter(Boolean) as string[];

  // "" is the empty/None choice (Stripe connection is optional). Business name
  // falls back to the account id, then a placeholder, when unnamed.
  const stripeDropdownOptions = [
    { label: "— None —", value: "" },
    ...stripeConnections.map((c) => ({
      label: c.businessName ?? c.stripeAccountId ?? "Unnamed connection",
      value: c.id,
    })),
  ];

  const resetAndClose = () => {
    onClose();
  };

  const handleSave = async () => {
    if (!name.trim() || !quickbookUuid) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), quickbookUuid, stripeConnectionUuid, address };
      if (isEditing && editing) {
        await updateSalesOffice(editing.id, editing.address_uuid, payload);
        createSuccessToast([`Sales office "${name}" updated.`]);
      } else {
        await createSalesOffice(payload);
        createSuccessToast([`Sales office "${name}" created.`]);
      }
      resetAndClose();
      onSaved();
    } catch (e) {
      createErrorToast(["Failed to save sales office.", String(e)]);
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
          <DialogTitle>{isEditing ? "Edit Sales Office" : "Add Sales Office"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Office Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Main Office"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              QuickBooks Connection *
            </label>
            <Dropdown
              options={qboDropdownOptions}
              selected={quickbookUuid}
              onSelect={setQuickbookUuid}
              placeholder={loadingQbo ? "Loading..." : "Select QuickBooks..."}
              disabled={loadingQbo}
            />
            <p className="text-xs text-gray-500 mt-1">
              Currency:{" "}
              <span className="font-medium text-gray-700">
                {selectedCurrency ?? "— (set once QuickBooks is connected)"}
              </span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Stripe Connection
            </label>
            <Dropdown
              options={stripeDropdownOptions}
              selected={stripeConnectionUuid ?? ""}
              onSelect={(v) => setStripeConnectionUuid(v || null)}
              placeholder={loadingStripe ? "Loading..." : "Select Stripe (optional)..."}
              disabled={loadingStripe}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Automated Emails</label>
            <AutoEmailsForSalesOfficeBtn officeId={editing?.id ?? null} />
          </div>
        </div>

        {name.trim() && missing.length > 0 && (
          <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              Not fully set up — still needs: {missing.join(", ")}. The office can be saved now and
              completed later.
            </span>
          </div>
        )}

        <div className="flex justify-between mt-4">
          <button
            onClick={resetAndClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !quickbookUuid || saving}
            className="px-4 py-2 text-sm font-semibold text-white bg-darkBlue rounded-sm shadow-md hover:bg-lightBlue transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Office"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
