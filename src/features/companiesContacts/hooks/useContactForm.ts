"use client";

import { useCallback, useEffect, useState } from "react";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { useTouchedErrors } from "@/lib/validation/useTouchedErrors";
import { useVenuesAll } from "@/features/venues/hooks/useVenuesAll";
import type { VenuePickerValue } from "@/features/venues/types";
import { createContact } from "../db/createContact";
import { updateContact } from "../db/updateContact";
import type { PreferredLanguage } from "../db/preferredLanguage";
import {
  contactFormStateFrom,
  emptyContactFormState,
  venueIdToSave,
  type ContactFormSource,
  type ContactFormState,
} from "../logic/contactForm";
import { findContactDuplicates } from "../utils/findDuplicates";
import { hasErrors, validateContactForm, type ContactFormValues } from "../utils/formValidation";
import { useCompaniesAll } from "./useCompaniesAll";
import { useContactsAll } from "./useContactsAll";

const CONTACT_FIELDS = ["firstName", "lastName", "email", "phone"] as const;

export type SavedContact = {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyUuid: string | null;
  companyName: string;
  notes: string;
  preferredLanguage: PreferredLanguage;
  defaultVenueUuid: string | null;
};

type Options = {
  /** null means create. */
  contact: (ContactFormSource & { id: string }) | null;
  /** Seeds first/last name on a fresh form — what was typed in a search box before "+ Create". */
  initialQuery?: string;
};

/**
 * The one Contact form: fields, validation, duplicate checks, default venue and saving, for both
 * create and edit. See docs/specs/companies-contacts-forms.md.
 */
export function useContactForm({ contact, initialQuery }: Options) {
  const { venues } = useVenuesAll();
  const { companies, isLoading: loadingCompanies } = useCompaniesAll();
  const { contacts } = useContactsAll();

  const [state, setState] = useState<ContactFormState>(() => emptyContactFormState(initialQuery));
  // A default venue the picker could not resolve must survive a save the user never aimed at it.
  const [venueTouched, setVenueTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const errors = validateContactForm(state.values);
  const { errorFor, markTouched, markAllTouched, reset: resetTouched } = useTouchedErrors(errors);

  const contactId = contact?.id ?? null;

  const reset = useCallback(() => {
    setState(contact ? contactFormStateFrom(contact, venues) : emptyContactFormState(initialQuery));
    setVenueTouched(false);
    resetTouched();
    // `venues` is deliberately not a dependency: re-seeding mid-edit because a venue synced in
    // would throw away what the user typed. An unresolved venue is handled by venueIdToSave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, initialQuery, resetTouched]);

  useEffect(() => {
    reset();
  }, [reset]);

  const setValue = (key: keyof ContactFormValues) => (value: string) =>
    setState((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));
  const setNotes = (notes: string) => setState((prev) => ({ ...prev, notes }));
  const setCompanyUuid = (companyUuid: string | null) =>
    setState((prev) => ({ ...prev, companyUuid }));
  const setPreferredLanguage = (preferredLanguage: PreferredLanguage) =>
    setState((prev) => ({ ...prev, preferredLanguage }));
  const setVenue = (venue: VenuePickerValue) => {
    setVenueTouched(true);
    setState((prev) => ({ ...prev, venue }));
  };

  const duplicateContacts = findContactDuplicates(contacts, state.values, contactId ?? undefined);
  const duplicates = duplicateContacts.map(
    (c) => `${c.firstName} ${c.lastName ?? ""}`.trim() + (c.email ? ` (${c.email})` : ""),
  );

  const canSave = !hasErrors(errors) && !saving && duplicateContacts.length === 0;

  const submit = async (): Promise<SavedContact | null> => {
    markAllTouched(CONTACT_FIELDS);
    if (!canSave) return null;

    setSaving(true);
    const defaultVenueUuid = venueIdToSave(state, contact?.defaultVenueId ?? null, venueTouched);
    const params = {
      ...state.values,
      notes: state.notes,
      companyUuid: state.companyUuid,
      preferredLanguage: state.preferredLanguage,
      defaultVenueUuid,
    };
    try {
      const id = contact
        ? (await updateContact(contact.id, params), contact.id)
        : await createContact(params);
      const displayName = `${state.values.firstName} ${state.values.lastName}`.trim();
      createSuccessToast([contact ? "Contact updated." : `Contact "${displayName}" created.`]);
      return {
        id,
        displayName,
        ...state.values,
        companyUuid: state.companyUuid,
        companyName: companies.find((c) => c.id === state.companyUuid)?.companyName ?? "",
        notes: state.notes,
        preferredLanguage: state.preferredLanguage,
        defaultVenueUuid,
      };
    } catch {
      return null; // error toast shown by createContact / updateContact
    } finally {
      setSaving(false);
    }
  };

  return {
    state,
    setValue,
    setNotes,
    setCompanyUuid,
    setPreferredLanguage,
    setVenue,
    errorFor,
    markTouched,
    duplicates,
    companies,
    loadingCompanies,
    canSave,
    saving,
    submit,
    reset,
  };
}

export type ContactForm = ReturnType<typeof useContactForm>;
