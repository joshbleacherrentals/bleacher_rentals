"use client";

import type { ChangeEvent } from "react";
import { X, Upload } from "lucide-react";
import AddressAutocomplete, { formatAddressLine } from "@/components/AddressAutoComplete";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SelectQboVendorSimple } from "@/features/manageTeam/components/inputs/SelectQboVendorSimple";
import { EinInput } from "@/features/manageTeam/components/inputs/EinInput";
import { HstInput } from "@/features/manageTeam/components/inputs/HstInput";
import {
  NO_STATUS_LABEL,
  VENDOR_SERVICES,
  VENDOR_STATUS_LABELS,
  VENDOR_TYPE_LABELS,
} from "@/features/vendors/utils/vendorLabels";
import {
  VENDOR_STATUSES,
  VENDOR_TYPES,
  type VendorAddress,
  type VendorFormValues,
  type VendorStatus,
  type VendorType,
  type VendorWindowMode,
} from "../utils/vendorForm";

/**
 * The inside of the vendor window: its fields and its buttons (docs/specs/vendors-page.md §4.2).
 * They are plain components of props, so the four modes of the window can be rendered and tested
 * without the dialog around them, which draws in a portal.
 */

const INPUT =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-greenAccent disabled:bg-gray-50 disabled:text-gray-500";
const LABEL = "block text-sm font-medium text-gray-700";

export type VendorLogoFieldProps = {
  preview: string | null;
  url: string | null;
  method: "upload" | "url";
  onMethodChange: (method: "upload" | "url") => void;
  onFile: (e: ChangeEvent<HTMLInputElement>) => void;
  onUrl: (url: string) => void;
  onRemove: () => void;
};

export type VendorFormFieldsProps = {
  values: VendorFormValues;
  onChange: (patch: Partial<VendorFormValues>) => void;
  /** A place was picked in the address field: the window marks the address as touched. */
  onAddressSelect: (address: VendorAddress) => void;
  /** The Clear address button: the window sets the address to none and marks it touched. */
  onAddressClear: () => void;
  /** Changes when the address field must start over (after Clear address). */
  addressKey: number;
  /** Every field locked: a deleted vendor (D17) and the viewer's window (D16). */
  locked: boolean;
  /** False in the viewer's window (D16), which has no QuickBooks block. */
  showQuickBooks: boolean;
  qboConnections: { id: string; display_name: string }[];
  logo: VendorLogoFieldProps;
};

export function VendorFormFields({
  values,
  onChange,
  onAddressSelect,
  onAddressClear,
  addressKey,
  locked,
  showQuickBooks,
  qboConnections,
  logo,
}: VendorFormFieldsProps) {
  const firstLetter = values.displayName.charAt(0).toUpperCase() || "?";
  const address = values.address;

  return (
    <fieldset disabled={locked} className="m-0 min-w-0 space-y-4 border-0 p-0">
      {/* Display Name */}
      <div className="space-y-2">
        <label htmlFor="displayName" className={LABEL}>
          Display Name *
        </label>
        <input
          id="displayName"
          type="text"
          value={values.displayName}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange({ displayName: e.target.value })}
          placeholder="Enter company name"
          className={INPUT}
        />
      </div>

      {/* Type and Status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="vendorType" className={LABEL}>
            Type *
          </label>
          <select
            id="vendorType"
            value={values.type}
            onChange={(e) => onChange({ type: e.target.value as VendorType | "" })}
            className={INPUT}
          >
            {values.type === "" && <option value="">Select a type...</option>}
            {VENDOR_TYPES.map((type) => (
              <option key={type} value={type}>
                {VENDOR_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="vendorStatus" className={LABEL}>
            Status
          </label>
          <select
            id="vendorStatus"
            value={values.status}
            onChange={(e) => onChange({ status: e.target.value as VendorStatus | "" })}
            className={INPUT}
          >
            <option value="">{NO_STATUS_LABEL}</option>
            {VENDOR_STATUSES.map((status) => (
              <option key={status} value={status}>
                {VENDOR_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* QuickBooks Connection + Vendor Mapping */}
      {showQuickBooks && (
        <>
          <div className="space-y-2">
            <label className={LABEL}>
              QuickBooks Connection{" "}
              <span className="text-xs font-semibold text-amber-600">
                ⚠ Strongly recommended — required for bill creation
              </span>
            </label>
            <select
              value={values.qboConnectionUuid || ""}
              onChange={(e) =>
                // The vendor belongs to a connection, so a new connection clears it.
                onChange({ qboConnectionUuid: e.target.value || null, qboVendorId: null })
              }
              className={INPUT}
            >
              <option value="">Select a connection...</option>
              {qboConnections.map((conn) => (
                <option key={conn.id} value={conn.id}>
                  {conn.display_name}
                </option>
              ))}
            </select>
            {!values.qboConnectionUuid && (
              <p className="text-xs text-amber-600">
                Without a QuickBooks connection, bills cannot be created for this vendor&apos;s
                drivers.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className={LABEL}>QuickBooks Vendor</label>
            <SelectQboVendorSimple
              value={values.qboVendorId}
              onChange={(qboVendorId) => onChange({ qboVendorId })}
              connectionId={values.qboConnectionUuid}
            />
            {values.qboConnectionUuid && !values.qboVendorId && (
              <p className="text-xs text-amber-600">
                Without a QuickBooks vendor, bills cannot be created for this vendor&apos;s drivers.
              </p>
            )}
          </div>
        </>
      )}

      {/* Address */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className={LABEL}>Address</label>
          {address && (
            <button
              type="button"
              onClick={onAddressClear}
              className="text-xs text-gray-500 underline hover:text-red-600 disabled:no-underline disabled:opacity-50"
            >
              Clear address
            </button>
          )}
        </div>
        <AddressAutocomplete
          key={addressKey}
          initialValue={
            address
              ? formatAddressLine({
                  street: address.street,
                  city: address.city,
                  state: address.stateProvince,
                  postalCode: address.zipPostal,
                })
              : ""
          }
          onAddressSelect={(data) =>
            onAddressSelect({
              street: data.address ?? "",
              city: data.city ?? "",
              stateProvince: data.state ?? "",
              zipPostal: data.postalCode ?? null,
              country: data.country ?? null,
              latitude: data.lat ?? null,
              longitude: data.lng ?? null,
              placeId: data.placeId ?? null,
            })
          }
          className="h-9 border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-greenAccent"
        />
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <label htmlFor="vendorContactName" className={LABEL}>
            Contact name
          </label>
          <input
            id="vendorContactName"
            type="text"
            value={values.contactName}
            onChange={(e) => onChange({ contactName: e.target.value })}
            className={INPUT}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="vendorPhone" className={LABEL}>
            Phone
          </label>
          <input
            id="vendorPhone"
            type="text"
            inputMode="tel"
            value={values.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            className={INPUT}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="vendorContactEmail" className={LABEL}>
            Email
          </label>
          <input
            id="vendorContactEmail"
            type="text"
            inputMode="email"
            value={values.contactEmail}
            onChange={(e) => onChange({ contactEmail: e.target.value })}
            className={INPUT}
          />
        </div>
      </div>

      {/* Services */}
      <div className="space-y-2">
        <p className={LABEL}>Services</p>
        <div className="grid grid-cols-2 gap-2">
          {VENDOR_SERVICES.map(({ key, label }) => {
            const id = `vendorService${key.charAt(0).toUpperCase()}${key.slice(1)}`;
            return (
              <label
                key={key}
                htmlFor={id}
                className="flex items-center gap-2 text-sm text-gray-700"
              >
                <input
                  id={id}
                  type="checkbox"
                  checked={values[key]}
                  onChange={(e) => onChange({ [key]: e.target.checked })}
                  className="h-4 w-4"
                />
                {label}
              </label>
            );
          })}
        </div>
      </div>

      {/* Tax ID Numbers */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EinInput value={values.ein} onChange={(ein) => onChange({ ein })} />
        <HstInput value={values.hst} onChange={(hst) => onChange({ hst })} />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label htmlFor="vendorNotes" className={LABEL}>
          Notes
        </label>
        <textarea
          id="vendorNotes"
          rows={3}
          value={values.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          className={INPUT}
        />
      </div>

      {/* Logo Section */}
      <div className="space-y-2">
        <label className={LABEL}>Logo (Optional)</label>

        {/* Logo Preview */}
        <div className="mb-3 flex items-center gap-4">
          <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-2 border-gray-200 bg-greenAccent/20">
            {logo.preview ? (
              // Use regular img tag to support any external URL without next.config.js restrictions
              <img src={logo.preview} alt="Logo preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-greenAccent">
                {firstLetter}
              </div>
            )}
          </div>
          {logo.preview && (
            <Button type="button" variant="outline" size="sm" onClick={logo.onRemove}>
              <X className="mr-1 h-4 w-4" />
              Remove
            </Button>
          )}
        </div>

        {/* Logo Input Methods */}
        <Tabs value={logo.method} onValueChange={(v) => logo.onMethodChange(v as "upload" | "url")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">Upload File</TabsTrigger>
            <TabsTrigger value="url">Image URL</TabsTrigger>
          </TabsList>
          <TabsContent value="upload" className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={logo.onFile}
                className="flex-1 text-sm file:mr-4 file:rounded file:border-0 file:bg-greenAccent/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-greenAccent hover:file:bg-greenAccent/20"
              />
              <Upload className="h-4 w-4 text-gray-500" />
            </div>
            <p className="text-xs text-gray-500">JPG, PNG, or WebP. Max 5MB.</p>
          </TabsContent>
          <TabsContent value="url" className="space-y-2">
            <input
              type="url"
              placeholder="https://example.com/logo.png"
              value={logo.url || ""}
              onChange={(e: ChangeEvent<HTMLInputElement>) => logo.onUrl(e.target.value)}
              className={INPUT}
            />
            <p className="text-xs text-gray-500">Paste a URL to an image hosted elsewhere.</p>
          </TabsContent>
        </Tabs>
      </div>
    </fieldset>
  );
}

export type VendorWindowFooterProps = {
  mode: VendorWindowMode;
  /** The driver page passes `onSave`: "Save & Assign" shows (create and edit only). */
  canAssign: boolean;
  isSaving: boolean;
  onDelete: () => void;
  onCancel: () => void;
  onSave: () => void;
  onSaveAndAssign: () => void;
  onRestore: () => void;
  onClose: () => void;
};

/** The buttons of each mode: D15 (Delete, Restore), D16 (read-only) and D17 (deleted). */
export function VendorWindowFooter({
  mode,
  canAssign,
  isSaving,
  onDelete,
  onCancel,
  onSave,
  onSaveAndAssign,
  onRestore,
  onClose,
}: VendorWindowFooterProps) {
  if (mode === "read-only") {
    return (
      <div className="flex items-center justify-end border-t pt-4">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  if (mode === "deleted") {
    return (
      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button onClick={onRestore} disabled={isSaving}>
          Restore
        </Button>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-t pt-4">
      <div>
        {mode === "edit" && (
          <Button variant="destructive" onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
        {canAssign && (
          <Button
            onClick={onSaveAndAssign}
            disabled={isSaving}
            className="bg-greenAccent hover:bg-greenAccent/90"
          >
            {isSaving ? "Saving..." : "Save & Assign"}
          </Button>
        )}
      </div>
    </div>
  );
}
