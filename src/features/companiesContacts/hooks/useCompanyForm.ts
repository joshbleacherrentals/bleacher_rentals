"use client";

import { useCallback, useEffect, useState } from "react";
import type { AddressFields } from "@/features/quotesAndBookings/types/quoteTypes";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { useTouchedErrors } from "@/lib/validation/useTouchedErrors";
import { saveCompany } from "../db/saveCompany";
import {
  companyFormStateFrom,
  emptyCompanyFormState,
  type CompanyFormState,
} from "../logic/companyForm";
import { findCompanyContactDuplicates, findCompanyDuplicates } from "../utils/findDuplicates";
import { hasErrors, validateCompanyForm, type CompanyFormValues } from "../utils/formValidation";
import { useCompaniesAll, type CompanyFull } from "./useCompaniesAll";

const COMPANY_FIELDS = ["companyName", "email", "phone"] as const;

export type SavedCompany = { id: string; companyName: string; email: string; phone: string };

/**
 * The one Company form: fields, validation, duplicate checks and saving, for both create and
 * edit. `company` null means create. See docs/specs/companies-contacts-forms.md.
 */
export function useCompanyForm(company: CompanyFull | null) {
  const [state, setState] = useState<CompanyFormState>(() =>
    company ? companyFormStateFrom(company) : emptyCompanyFormState(),
  );
  const [saving, setSaving] = useState(false);

  const errors = validateCompanyForm(state.values);
  const { errorFor, markTouched, markAllTouched, reset: resetTouched } = useTouchedErrors(errors);

  const reset = useCallback(() => {
    setState(company ? companyFormStateFrom(company) : emptyCompanyFormState());
    resetTouched();
  }, [company, resetTouched]);

  // Seeds when the modal opens on another company; edits in progress are never overwritten,
  // because a reactive re-emit hands back the same company object identity.
  useEffect(() => {
    reset();
  }, [reset]);

  const setValue = (key: keyof CompanyFormValues) => (value: string) =>
    setState((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));
  const setNotes = (notes: string) => setState((prev) => ({ ...prev, notes }));
  const setBilling = (billing: AddressFields) => setState((prev) => ({ ...prev, billing }));
  const setShipping = (shipping: AddressFields) => setState((prev) => ({ ...prev, shipping }));
  const setSameAsBilling = (sameAsBilling: boolean) =>
    setState((prev) => ({ ...prev, sameAsBilling }));

  const { companies } = useCompaniesAll();
  const labelOf = (c: { companyName: string; email: string | null }) =>
    c.companyName + (c.email ? ` (${c.email})` : "");

  // Email/phone matches hard-block saving; a name-only match is just advisory. The company being
  // edited never counts as its own duplicate.
  const blocking = findCompanyContactDuplicates(companies, state.values, company?.id);
  const blockingDuplicates = blocking.map(labelOf);
  const nameOnlyDuplicates = findCompanyDuplicates(
    companies,
    { companyName: state.values.companyName, email: "", phone: "" },
    company?.id,
  )
    .filter((c) => !blocking.some((b) => b.id === c.id))
    .map(labelOf);

  const canSave = !hasErrors(errors) && !saving && blocking.length === 0;

  const submit = async (): Promise<SavedCompany | null> => {
    markAllTouched(COMPANY_FIELDS);
    if (!canSave) return null;

    setSaving(true);
    try {
      const id = await saveCompany(
        {
          ...state.values,
          notes: state.notes,
          billingAddress: state.billing,
          shippingAddress: state.sameAsBilling ? state.billing : state.shipping,
        },
        company
          ? {
              id: company.id,
              addressIds: {
                billing: company.billingAddress?.id ?? null,
                shipping: company.shippingAddress?.id ?? null,
              },
            }
          : null,
      );
      createSuccessToast([
        company ? "Company updated." : `Company "${state.values.companyName}" created.`,
      ]);
      return { id, ...state.values };
    } catch {
      return null; // error toast shown by saveCompany
    } finally {
      setSaving(false);
    }
  };

  return {
    state,
    setValue,
    setNotes,
    setBilling,
    setShipping,
    setSameAsBilling,
    errorFor,
    markTouched,
    blockingDuplicates,
    nameOnlyDuplicates,
    canSave,
    saving,
    submit,
    reset,
  };
}

export type CompanyForm = ReturnType<typeof useCompanyForm>;
