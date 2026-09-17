import type { VenueFull, VenuePickerValue } from "@/features/venues/types";
import type { PreferredLanguage } from "../db/preferredLanguage";
import type { ContactFormValues } from "../utils/formValidation";

export type ContactFormState = {
  values: ContactFormValues;
  notes: string;
  companyUuid: string | null;
  preferredLanguage: PreferredLanguage;
  venue: VenuePickerValue;
};

/** What the form needs from an existing contact — satisfied by ContactFull and ContactOption. */
export type ContactFormSource = {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  companyUuid: string | null;
  preferredLanguage: PreferredLanguage;
  defaultVenueId: string | null;
};

const EMPTY_VENUE: VenuePickerValue = { mode: "empty", venueId: null, address: null };

/**
 * A blank form. `initialQuery` is whatever was typed in a search box before "+ Create New
 * Contact", split on the first run of whitespace into first / last name.
 */
export function emptyContactFormState(initialQuery?: string): ContactFormState {
  const [first = "", ...rest] = (initialQuery ?? "").trim().split(/\s+/);
  return {
    values: { firstName: first, lastName: rest.join(" "), email: "", phone: "" },
    notes: "",
    companyUuid: null,
    preferredLanguage: "english",
    venue: EMPTY_VENUE,
  };
}

export function contactFormStateFrom(
  src: ContactFormSource,
  venues: VenueFull[],
): ContactFormState {
  const venue = src.defaultVenueId ? venues.find((v) => v.id === src.defaultVenueId) : undefined;
  return {
    values: {
      firstName: src.firstName,
      lastName: src.lastName ?? "",
      email: src.email ?? "",
      phone: src.phone ?? "",
    },
    notes: src.notes ?? "",
    companyUuid: src.companyUuid,
    preferredLanguage: src.preferredLanguage,
    venue: venue
      ? { mode: "venue", venueId: venue.id, name: venue.name, address: venue.address }
      : EMPTY_VENUE,
  };
}

/**
 * The venue uuid to persist. A default venue the picker could not resolve (soft-deleted, or not
 * synced yet) shows as empty — saving must not wipe it unless the user actually used the picker.
 */
export function venueIdToSave(
  state: ContactFormState,
  originalVenueId: string | null,
  venueTouched: boolean,
): string | null {
  if (state.venue.mode === "venue") return state.venue.venueId;
  return venueTouched ? null : originalVenueId;
}
