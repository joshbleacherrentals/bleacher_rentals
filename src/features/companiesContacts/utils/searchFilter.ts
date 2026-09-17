import type { AddressFields } from "@/features/quotesAndBookings/types/quoteTypes";
import type { VenueFull } from "@/features/venues/types";
import { PREFERRED_LANGUAGE_OPTIONS, type PreferredLanguage } from "../db/preferredLanguage";

/**
 * What the Companies & Contacts search bars match against. The field lists live here and only
 * here — see docs/specs/companies-contacts-forms.md §5.
 */

export type CompanySearchable = {
  companyName: string;
  email: string | null;
  phone: string | null;
  billingAddress: AddressFields | null;
  shippingAddress: AddressFields | null;
};

export type ContactSearchable = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  preferredLanguage: PreferredLanguage;
  defaultVenue: VenueFull | null;
  company: CompanySearchable | null;
};

type Part = string | number | null | undefined;

function addressParts(a: AddressFields | null): Part[] {
  if (!a) return [];
  return [a.street, a.city, a.stateProvince, a.zipPostal, a.lat, a.lng, a.country];
}

function join(parts: Part[]): string {
  return parts
    .filter((p) => p !== null && p !== undefined && p !== "")
    .map(String)
    .join("\n")
    .toLowerCase();
}

export function companySearchText(c: CompanySearchable): string {
  return join([
    c.companyName,
    c.phone,
    c.email,
    ...addressParts(c.billingAddress),
    ...addressParts(c.shippingAddress),
  ]);
}

export function contactSearchText(c: ContactSearchable): string {
  const languageLabel = PREFERRED_LANGUAGE_OPTIONS.find(
    (o) => o.value === c.preferredLanguage,
  )?.label;
  return join([
    `${c.firstName} ${c.lastName ?? ""}`.trim(),
    c.phone,
    c.email,
    c.preferredLanguage,
    languageLabel,
    c.defaultVenue?.name,
    ...addressParts(c.defaultVenue?.address ?? null),
    c.company ? companySearchText(c.company) : null,
  ]);
}

function filterBy<T>(rows: T[], query: string, text: (row: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => text(row).includes(q));
}

export function filterCompanies<T extends CompanySearchable>(rows: T[], query: string): T[] {
  return filterBy(rows, query, companySearchText);
}

export function filterContacts<T extends ContactSearchable>(rows: T[], query: string): T[] {
  return filterBy(rows, query, contactSearchText);
}
