"use client";

import { useEffect, useRef } from "react";
import { CreateQuoteForm } from "@/features/quotesAndBookings/components/createQuote/CreateQuoteForm";
import {
  useCreateQuoteStore,
  hasUnsavedChanges,
  captureQuoteBaseline,
} from "@/features/quotesAndBookings/state/useCreateQuoteStore";
import { newQuoteFieldsToPrefill } from "@/features/quotesAndBookings/utils/newQuoteDefaults";
import { useTermsAndConditions } from "@/features/termsAndConditions/hooks/useTermsAndConditions";
import { useCurrentAmDefaultSalesOffice } from "@/features/quotesAndBookings/hooks/useCurrentAmDefaultSalesOffice";

export default function NewQuotePage() {
  const resetForm = useCreateQuoteStore((s) => s.resetForm);
  const editingEventId = useCreateQuoteStore((s) => s.editingEventId);
  // Null until PowerSync has the table, and when no template is marked default.
  const { defaultId: defaultTermsId } = useTermsAndConditions();
  // Null for admins/non-AMs, or when the current AM has not set one.
  const defaultSalesOfficeId = useCurrentAmDefaultSalesOffice();

  /**
   * Whether a draft was already in progress when this page opened.
   *
   * It has to be read before `captureQuoteBaseline` below, which makes `hasUnsavedChanges()` false
   * by definition — the baseline becomes whatever the form currently holds.
   */
  const openedOverADraft = useRef(false);

  useEffect(() => {
    openedOverADraft.current = hasUnsavedChanges();
    if (editingEventId) {
      resetForm();
      openedOverADraft.current = false;
    }
    // Snapshot the starting state (fresh form or a restored draft) so the guard
    // only fires on changes made after the page opened.
    captureQuoteBaseline();
  }, []);

  /**
   * Starter notes and the default contract template — docs/specs/default-terms-template.md.
   *
   * On the page rather than the "+ Create Quote" button, so a typed URL, a refresh or a link all
   * start the same way. Keyed on the default arriving rather than on a loading flag: `useQuery`
   * reports isLoading false with no rows in more than one case (including PowerSync not being
   * configured), and a one-shot effect would then fill nothing and never retry.
   *
   * Each field is only filled while still empty, so nothing the user typed, chose or cleared is
   * overwritten, and re-running as data arrives is harmless.
   */
  useEffect(() => {
    const store = useCreateQuoteStore.getState();
    const prefill = newQuoteFieldsToPrefill({
      editingEventId: store.editingEventId,
      openedOverADraft: openedOverADraft.current,
      currentNotes: store.clientFacingNotes,
      currentTermsId: store.termsDocumentId,
      defaultTermsId,
      currentSalesOfficeId: store.salesOfficeId,
      defaultSalesOfficeId,
    });

    if (prefill.clientFacingNotes !== undefined) {
      store.setField("clientFacingNotes", prefill.clientFacingNotes);
    }
    if (prefill.termsDocumentId !== undefined) {
      store.setField("termsDocumentId", prefill.termsDocumentId);
    }
    if (prefill.salesOfficeId !== undefined) {
      store.setField("salesOfficeId", prefill.salesOfficeId);
    }
    // A prefilled form is the starting point, not an unsaved change.
    if (Object.keys(prefill).length > 0) captureQuoteBaseline();
  }, [defaultTermsId, defaultSalesOfficeId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  return <CreateQuoteForm />;
}
