"use client";

import AddressAutocomplete, { formatAddressLine } from "@/components/AddressAutoComplete";
import { FIELD_LABEL } from "@/components/form/TextField";
import { AddressFields } from "@/features/quotesAndBookings/types/quoteTypes";

export const EMPTY_ADDRESS: AddressFields = {
  street: "",
  city: "",
  stateProvince: "",
  zipPostal: "",
};

type Props = {
  label: string;
  value: AddressFields;
  onChange: (address: AddressFields) => void;
};

/** Autocomplete address picker — the field itself shows the full street/city/state/zip line. */
export function AddressSection({ label, value, onChange }: Props) {
  return (
    <div>
      <p className={FIELD_LABEL}>{label}</p>
      <AddressAutocomplete
        initialValue={formatAddressLine({
          street: value.street,
          city: value.city,
          state: value.stateProvince,
          postalCode: value.zipPostal,
        })}
        onAddressSelect={(data) =>
          onChange({
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
        className="h-9 px-3 bg-gray-50 border border-gray-200 rounded-md text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-400/20 focus:border-blue-400 transition-colors"
      />
    </div>
  );
}
