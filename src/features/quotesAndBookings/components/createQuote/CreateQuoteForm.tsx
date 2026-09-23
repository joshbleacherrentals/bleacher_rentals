"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCreateQuoteStore,
  hasUnsavedChanges,
  captureQuoteBaseline,
} from "../../state/useCreateQuoteStore";
import { QuoteDetailsSection } from "./sections/QuoteDetailsSection";
import { ClientInfoSection } from "./sections/ClientInfoSection";
import { EventDetailsSection } from "./sections/EventDetailsSection";
import { LineItemsSection } from "./sections/LineItemsSection";
import { TotalsDisplay } from "./sections/TotalsDisplay";

import { NotesSection } from "./sections/NotesSection";
import { PaymentScheduleSection } from "./sections/PaymentScheduleSection";
import { TermsSection } from "./sections/TermsSection";
import { AddLineItemModal } from "./modals/AddLineItemModal";
import { EditPaymentScheduleModal } from "./modals/EditPaymentScheduleModal";
import { createQuoteEvent } from "../../db/createQuoteEvent";
import { updateQuoteEvent } from "../../db/updateQuoteEvent";
import { logQuoteSentLocal } from "../../db/logQuoteSentLocal";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToast, createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { useAutoTax } from "../../hooks/useAutoTax";
import { useCurrentUserUuid } from "../../hooks/useCurrentUserUuid";
import { triage } from "@/features/alerts/triage";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useNavigationGuard } from "../../hooks/useNavigationGuard";
import { UnsavedChangesDialog } from "./modals/UnsavedChangesDialog";
import { draftSaveDefaults, validateQuoteForSend } from "../../utils/quoteValidation";
import { validateLostReason } from "../../utils/lostReason";
import { cleanRecipients } from "../../utils/sendQuote";
import { SendQuoteDialog } from "../sendQuote/SendQuoteDialog";

export function CreateQuoteForm() {
  const router = useRouter();
  const resetForm = useCreateQuoteStore((s) => s.resetForm);
  const editingEventId = useCreateQuoteStore((s) => s.editingEventId);
  const supabase = useClerkSupabaseClient();
  const currentUserUuid = useCurrentUserUuid();
  const [saving, setSaving] = useState(false);
  const [sendTarget, setSendTarget] = useState<{ eventId: string; recipients: string[] } | null>(
    null,
  );
  const perms = usePermissionsStore();
  // Review-gating disabled per boss feedback — all AMs can send quotes
  // const canSendDirectly = perms.isAdmin || perms.leadZoneIds.length > 0;
  const canSendDirectly = perms.isAdmin || perms.isAccountManager;

  // Auto-fetch tax from QBO when office + address are set
  const { qboError, countryMismatch } = useAutoTax();

  const isEditing = !!editingEventId;

  // Marking a quote lost is the last moment the reason can be captured, so it
  // gates every write — including the draft Save, which blocks on nothing else.
  const validateLost = (): boolean => {
    const errors = validateLostReason(useCreateQuoteStore.getState());
    // No-throw: this is a refusal to save, not a failure — the caller decides
    // what happens next (stay on the page, keep the guard dialog open).
    if (errors.length > 0) createErrorToastNoThrow(errors);
    return errors.length === 0;
  };

  // Full completeness check — required before a quote can be sent or previewed.
  const validateRequiredFields = (): boolean => {
    const result = validateQuoteForSend(useCreateQuoteStore.getState());
    if (!result.ok) createErrorToast(result.errors);
    return result.ok;
  };

  const handleCancel = () => {
    resetForm();
    captureQuoteBaseline(); // explicit exit — don't trip the unsaved-changes guard
    if (isEditing) {
      router.push(`/quotes-bookings/${editingEventId}`);
    } else {
      router.push("/quotes-bookings");
    }
  };

  /**
   * Persist the quote without navigating — a draft has no required fields,
   * so this always succeeds unless the write itself fails. Returns the event
   * id on success (used by the Save button and the unsaved-changes guard),
   * or null on error.
   */
  const persistQuote = async (): Promise<string | null> => {
    if (!validateLost()) return null;
    setSaving(true);
    try {
      // event_name/start/end are NOT NULL columns — default a blank one so an
      // otherwise-empty draft can still be saved. Only affects what's written;
      // the visible form fields are left alone.
      const formState = useCreateQuoteStore.getState();
      const state = { ...formState, ...draftSaveDefaults(formState) };
      let eventId: string;
      if (isEditing) {
        await updateQuoteEvent(editingEventId, state, supabase, currentUserUuid ?? perms.userId);
        eventId = editingEventId;
      } else {
        eventId = await createQuoteEvent(state, supabase, currentUserUuid ?? perms.userId);
      }
      void triage("Events", { id: eventId }, supabase);
      createSuccessToast([isEditing ? "Quote updated." : "Quote draft saved."]);
      resetForm();
      captureQuoteBaseline(); // form is clean again — no spurious leave prompt
      return eventId;
    } catch (error) {
      createErrorToastNoThrow([
        (error as Error).message || "Could not save the quote. Your draft has been retained.",
      ]);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const eventId = await persistQuote();
    if (eventId) router.push(`/quotes-bookings/${eventId}`);
  };

  // Unsaved-changes guard for in-app navigation (sidebar, links, back button).
  const guard = useNavigationGuard(() => hasUnsavedChanges() && !saving);

  const handleGuardSave = async () => {
    const eventId = await persistQuote();
    if (eventId) guard.confirm();
    else guard.cancel(); // validation failed — stay so the user can fix it
  };

  const handleGuardDiscard = () => {
    resetForm();
    captureQuoteBaseline();
    guard.confirm();
  };

  const handlePreviewPdf = async () => {
    if (!validateLost() || !validateRequiredFields()) return;
    setSaving(true);
    try {
      const state = useCreateQuoteStore.getState();
      let eventId: string;
      if (isEditing) {
        await updateQuoteEvent(editingEventId, state, supabase, currentUserUuid ?? perms.userId);
        eventId = editingEventId;
      } else {
        eventId = await createQuoteEvent(state, supabase, currentUserUuid ?? perms.userId);
      }
      void triage("Events", { id: eventId }, supabase);
      // Open preview in new tab, keep form open
      window.open(`/quotes-bookings/${eventId}/preview`, "_blank");
      if (!isEditing) {
        // Update store so subsequent saves do UPDATE not INSERT
        useCreateQuoteStore.getState().setField("editingEventId", eventId);
      }
    } catch (error) {
      createErrorToastNoThrow([
        (error as Error).message || "Could not save the quote. Your draft has been retained.",
      ]);
    } finally {
      setSaving(false);
    }
  };

  // Sending is two steps: save the quote as it stands (so the preview can be built from it), then
  // review it in SendQuoteDialog. The status only becomes "quoted" when Send is pressed.
  const handleSendQuote = async () => {
    if (!validateLost() || !validateRequiredFields()) return;

    const state = useCreateQuoteStore.getState();
    const recipients = cleanRecipients([state.companyEmail, state.financeContactEmail]);
    if (recipients.length === 0) {
      createErrorToast(["Add a contact email before sending."]);
      return;
    }

    setSaving(true);
    try {
      let eventId: string;
      if (isEditing) {
        await updateQuoteEvent(editingEventId, state, supabase, currentUserUuid ?? perms.userId);
        eventId = editingEventId;
      } else {
        eventId = await createQuoteEvent(state, supabase, currentUserUuid ?? perms.userId);
        // Later saves must UPDATE this quote, not insert another.
        useCreateQuoteStore.getState().setField("editingEventId", eventId);
      }
      void triage("Events", { id: eventId }, supabase);
      setSendTarget({ eventId, recipients });
    } catch (error) {
      createErrorToastNoThrow([
        (error as Error).message || "Could not save the quote. Your draft has been retained.",
      ]);
    } finally {
      setSaving(false);
    }
  };

  const markQuoted = async () => {
    if (!sendTarget) return;
    useCreateQuoteStore.getState().setField("status", "quoted");
    await updateQuoteEvent(
      sendTarget.eventId,
      useCreateQuoteStore.getState(),
      supabase,
      currentUserUuid ?? perms.userId,
    );
    void triage("Events", { id: sendTarget.eventId }, supabase);
  };

  const handleSent = () =>
    logQuoteSentLocal({
      eventId: sendTarget!.eventId,
      recipientLine: sendTarget!.recipients.join(","),
      currentUserUuid: currentUserUuid ?? perms.userId,
    });

  const handleSendDone = () => {
    const eventId = sendTarget?.eventId;
    resetForm();
    captureQuoteBaseline();
    if (eventId) router.push(`/quotes-bookings/${eventId}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{isEditing ? "Edit Quote" : "Create Quote"}</h1>
        <button
          onClick={handleCancel}
          className="p-2 text-gray-500 hover:text-gray-700 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {countryMismatch && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
          <span className="font-semibold">
            Sales Office and event address are in different countries.
          </span>{" "}
          {countryMismatch === "cad-office-us-address"
            ? "This is a Canadian (CAD) Sales Office, but the event address is in the US."
            : "This is a US (USD) Sales Office, but the event address is in Canada."}{" "}
          Tax cannot be calculated — pick a Sales Office in the same country as the event, or enter
          the tax manually.
        </div>
      )}

      {qboError && (
        <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">
          Failed to load tax data from QuickBooks. Make sure QuickBooks is connected to this Sales
          Office. If you have access,{" "}
          <a href="/quickbooks" className="underline font-semibold hover:text-red-800">
            go to the QuickBooks page
          </a>{" "}
          to authenticate a connection.
        </div>
      )}

      <div className="space-y-8">
        <QuoteDetailsSection />
        <ClientInfoSection />
        <EventDetailsSection />

        <LineItemsSection />
        <TotalsDisplay />

        <PaymentScheduleSection />
        <NotesSection />
        <TermsSection />
      </div>

      <div className="flex items-center justify-between pt-6 pb-4 mt-8 border-t border-gray-200">
        <button
          onClick={handleCancel}
          className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handlePreviewPdf}
            className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
          >
            Preview PDF
          </button>
          {canSendDirectly && (
            <button
              onClick={handleSendQuote}
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-darkBlue rounded-sm shadow-md hover:bg-lightBlue transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Send Quote →"}
            </button>
          )}
        </div>
      </div>

      <AddLineItemModal />
      <EditPaymentScheduleModal />
      {sendTarget && (
        <SendQuoteDialog
          open
          onOpenChange={(open) => !open && setSendTarget(null)}
          eventId={sendTarget.eventId}
          recipientEmails={sendTarget.recipients}
          onBeforeSend={markQuoted}
          onSent={handleSent}
          onDone={handleSendDone}
        />
      )}
      <UnsavedChangesDialog
        open={guard.isBlocking}
        saving={saving}
        onSave={handleGuardSave}
        onDiscard={handleGuardDiscard}
        onCancel={guard.cancel}
      />
    </div>
  );
}
