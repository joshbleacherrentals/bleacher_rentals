"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreateQuoteForm } from "@/features/quotesAndBookings/components/createQuote/CreateQuoteForm";
import {
  useCreateQuoteStore,
  hasUnsavedChanges,
  captureQuoteBaseline,
} from "@/features/quotesAndBookings/state/useCreateQuoteStore";
import { loadQuoteIntoStore } from "@/features/quotesAndBookings/db/loadQuoteIntoStore";
import { useQuotesBookingsCapabilities } from "@/features/quotesAndBookings/hooks/useQuotesBookingsCapabilities";
import { editQuotePageDecision } from "@/features/quotesAndBookings/utils/quotePageGuard";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";

export default function EditQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  // Who created the quote, read once when it has loaded. The form lets the owner be changed, and
  // changing it must not take the page away from someone who was let in.
  const [creatorUserId, setCreatorUserId] = useState<string | null>(null);
  const resetForm = useCreateQuoteStore((s) => s.resetForm);
  const setField = useCreateQuoteStore((s) => s.setField);

  useEffect(() => {
    resetForm();

    loadQuoteIntoStore(id).then((eventId) => {
      if (!eventId) {
        router.push("/quotes-bookings");
        return;
      }
      setField("editingEventId", eventId);
      // Baseline = the loaded quote, so an untouched edit page is not "dirty".
      captureQuoteBaseline();
      setCreatorUserId(useCreateQuoteStore.getState().ownerUserUuid);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Only a role that can manage this quote gets the form (the owner rule applies to an account
  // manager); any other is sent to the card. Until the answer is known the loading state stays, so
  // the form never flashes. docs/specs/accountant-quotes-04-accountant-quote-access.md, D2 and D8.
  const can = useQuotesBookingsCapabilities({ createdByUserId: creatorUserId });
  // Empty until sign-in has filled the store; "not known yet" is waiting, never a redirect.
  const rolesKnown = usePermissionsStore((state) => state.roles.length > 0);
  const decision = editQuotePageDecision({ rolesKnown, quoteLoaded: !loading, can });

  useEffect(() => {
    if (decision === "redirect") router.replace(`/quotes-bookings/${id}`);
  }, [decision, id, router]);

  if (decision !== "form") {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Loading quote...</p>
      </div>
    );
  }

  return <CreateQuoteForm />;
}
