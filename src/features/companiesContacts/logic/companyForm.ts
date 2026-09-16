import type { AddressFields } from "@/features/quotesAndBookings/types/quoteTypes";
import type { CompanyFull } from "../hooks/useCompaniesAll";
import type { CompanyFormValues } from "../utils/formValidation";
import { EMPTY_ADDRESS } from "./address";

export type CompanyFormState = {
  values: CompanyFormValues;
  notes: string;
  billing: AddressFields;
  shipping: AddressFields;
  sameAsBilling: boolean;
};

const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase();

/** Same place for the "shipping same as billing" box: coordinates and place id are ignored. */
export function isSameAddress(a: AddressFields, b: AddressFields): boolean {
  return (
    norm(a.street) === norm(b.street) &&
    norm(a.city) === norm(b.city) &&
    norm(a.stateProvince) === norm(b.stateProvince) &&
    norm(a.zipPostal) === norm(b.zipPostal) &&
    norm(a.country) === norm(b.country)
  );
}

export function emptyCompanyFormState(): CompanyFormState {
  return {
    values: { companyName: "", email: "", phone: "" },
    notes: "",
    billing: { ...EMPTY_ADDRESS },
    shipping: { ...EMPTY_ADDRESS },
    sameAsBilling: true,
  };
}

/** Strips the row id: the form edits fields, saveCompany decides which row they land in. */
function fieldsOf(address: AddressFields & { id?: string }): AddressFields {
  const { id: _id, ...fields } = address;
  return fields;
}

export function companyFormStateFrom(company: CompanyFull): CompanyFormState {
  const billing = company.billingAddress ? fieldsOf(company.billingAddress) : { ...EMPTY_ADDRESS };
  const shipping = company.shippingAddress ? fieldsOf(company.shippingAddress) : null;
  return {
    values: {
      companyName: company.companyName,
      email: company.email ?? "",
      phone: company.phone ?? "",
    },
    notes: company.notes ?? "",
    billing,
    shipping: shipping ?? { ...EMPTY_ADDRESS },
    sameAsBilling: !shipping || isSameAddress(billing, shipping),
  };
}
