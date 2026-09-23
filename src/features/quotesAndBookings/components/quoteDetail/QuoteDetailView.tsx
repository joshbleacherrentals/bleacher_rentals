"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LayoutDashboard, Trash2, Send } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { QuoteDetail, fetchQuoteDetail } from "../../db/fetchQuoteDetail";
import { softDeleteEvent } from "../../db/softDeleteEvent";
import { useEventLineItems } from "../../hooks/useEventLineItems";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { ContractTab } from "./tabs/ContractTab";
import { BillingTab } from "./tabs/BillingTab";
import { FilesTab } from "./tabs/FilesTab";
import { LogTab } from "./tabs/LogTab";
import { MessagesTab } from "./tabs/MessagesTab";
import { useEventCurrency } from "../../hooks/useEventCurrency";
import { formatMoney } from "../../utils/formatMoney";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { loadEventForModal } from "@/features/eventConfiguration/functions/loadEventForModal";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
// import { canSendQuote } from "@/features/userAccess/logic/canEditOwnedEntity";
import { canEditOwnedEntity } from "@/features/userAccess/logic/canEditOwnedEntity";
import { getAmRoleForZone } from "@/features/userAccess/logic/getAmRoleForZone";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { logQuoteSentLocal } from "../../db/logQuoteSentLocal";
import { SendQuoteDialog } from "../sendQuote/SendQuoteDialog";
import { cleanRecipients } from "../../utils/sendQuote";
// import { requestReview } from "@/features/alerts/requestReview";
// import { ClipboardCheck } from "lucide-react";
import { DateTime } from "luxon";

const QUOTE_TABS = ["contract", "billing", "files", "log", "messages"] as const;
type QuoteTab = (typeof QUOTE_TABS)[number];

function isQuoteTab(tab: string | null): tab is QuoteTab {
  return QUOTE_TABS.includes(tab as QuoteTab);
}

export function QuoteDetailView({ eventId }: { eventId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useClerkSupabaseClient();
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);

  const perms = usePermissionsStore();

  // Active tab stays in sync with ?tab=… (deep links from chat notifications, shareable URLs).
  const activeTab = useMemo(() => {
    const tab = searchParams.get("tab");
    return isQuoteTab(tab) ? tab : "contract";
  }, [searchParams]);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (!isQuoteTab(tab)) return;

      const params = new URLSearchParams(searchParams.toString());
      if (tab === "contract") {
        params.delete("tab");
      } else {
        params.set("tab", tab);
      }

      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Get the bleacher zone for this event (via BleacherEvents → Bleachers)
  const eventZoneCompiled = useMemo(
    () =>
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
        .select(["b.zone_uuid as zone_uuid"])
        .where("be.event_uuid", "=", eventId)
        .limit(1)
        .compile(),
    [eventId],
  );
  const { data: eventZoneRows } = useTypedQuery(
    eventZoneCompiled,
    expect<{ zone_uuid: string | null }>(),
  );
  const eventZoneUuid = eventZoneRows?.[0]?.zone_uuid ?? null;

  // Deletion info from EventChangeLog
  const deleteLogCompiled = useMemo(
    () =>
      db
        .selectFrom("EventChangeLog as cl")
        .leftJoin("Users as u", "cl.changed_by_user_uuid", "u.id")
        .select([
          "cl.changed_at as changed_at",
          "u.first_name as first_name",
          "u.last_name as last_name",
        ])
        .where("cl.event_uuid", "=", eventId)
        .where("cl.field_name", "=", "deleted")
        .where("cl.action_type", "=", "status_change")
        .orderBy("cl.changed_at", "desc")
        .limit(1)
        .compile(),
    [eventId],
  );
  const { data: deleteLogRows } = useTypedQuery(
    deleteLogCompiled,
    expect<{ changed_at: string | null; first_name: string | null; last_name: string | null }>(),
  );

  // Line items from PowerSync (reactive)
  const { lineItems } = useEventLineItems(eventId);
  const currency = useEventCurrency(eventId);

  const contractTotalCents = useMemo(() => {
    const lineTotal = lineItems.reduce((sum, li) => sum + li.valueCents * li.quantity, 0);
    const tax = quote?.taxAmountCents ?? 0;
    return lineTotal + tax;
  }, [lineItems, quote?.taxAmountCents]);

  const handleOpenInDashboard = async () => {
    await loadEventForModal(eventId, "dashboard");
    router.push("/dashboard");
  };

  const handleDelete = async () => {
    if (
      !confirm("Are you sure you want to delete this quote? This action can be undone by an admin.")
    )
      return;
    setDeleting(true);
    const ok = await softDeleteEvent(eventId, supabase, perms.userId);
    if (ok) {
      createSuccessToast(["Quote deleted."]);
      router.push("/quotes-bookings");
    }
    setDeleting(false);
  };

  const sendRecipients = cleanRecipients([quote?.contact?.email, quote?.financeContact?.email]);

  const handleSendToClient = () => {
    if (sendRecipients.length === 0) {
      createErrorToast([
        "No contact email found. Please add a contact with an email address first.",
      ]);
      return;
    }
    setSendDialogOpen(true);
  };

  // Review-gating disabled per boss feedback — all AMs can send quotes
  // const canSend = canSendQuote({
  //   isAdmin: perms.isAdmin,
  //   leadZoneIds: perms.leadZoneIds,
  // });
  const canSend = perms.isAdmin || perms.isAccountManager;

  const canEditQuote = canEditOwnedEntity({
    isAdmin: perms.isAdmin,
    isNew: false,
    isAccountManager: perms.isAccountManager,
    leadZoneIds: perms.leadZoneIds,
    accountManagerZoneIds: perms.accountManagerZoneIds,
    createdByUserId: quote?.createdByUserUuid,
    assignedUserId: quote?.createdByUserUuid,
    userId: perms.userId,
  });

  // Review-request flow disabled per boss feedback — kept for future use
  // const handleRequestQuoteReview = async () => {
  //   if (!quote || !eventZoneUuid) return;
  //   try {
  //     await requestReview({
  //       entityUuid: eventId,
  //       entityType: "event",
  //       bleacherZoneUuid: eventZoneUuid,
  //       message: `Review requested for Quote "${quote.eventName}"`,
  //       entityDescription: `Quote – ${quote.eventName}`,
  //     });
  //     createSuccessToast(["Review request sent to Lead Account Manager"]);
  //   } catch (error) {
  //     createErrorToast(["Failed to request review:", String(error)]);
  //   }
  // };

  useEffect(() => {
    setLoading(true);
    fetchQuoteDetail(eventId)
      .then(setQuote)
      .finally(() => setLoading(false));
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-gray-500">Loading quote...</p>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-gray-500">Quote not found</p>
        <button
          onClick={() => router.push("/quotes-bookings")}
          className="text-sm text-darkBlue underline cursor-pointer"
        >
          Back to Quotes & Bookings
        </button>
      </div>
    );
  }

  const isDeleted = quote.deleted;
  const deleteLog = deleteLogRows?.[0] ?? null;
  const deletedAtFormatted = deleteLog?.changed_at
    ? DateTime.fromISO(deleteLog.changed_at).toFormat("MMM d, yyyy 'at' h:mm a")
    : null;
  const deletedByName =
    [deleteLog?.first_name, deleteLog?.last_name].filter(Boolean).join(" ") || null;

  return (
    <div>
      {isDeleted && (
        <div className="bg-red-50 border border-red-200 rounded-t-lg px-6 py-3 text-sm text-red-800 flex items-center gap-2">
          <Trash2 className="w-4 h-4 shrink-0" />
          <span>
            This quote was deleted
            {deletedByName ? ` by ${deletedByName}` : ""}
            {deletedAtFormatted ? ` on ${deletedAtFormatted}` : ""}
          </span>
        </div>
      )}

      {/* Header */}
      <div className={`bg-darkBlue text-white px-6 py-4 ${isDeleted ? "" : "rounded-t-lg"}`}>
        <div className="flex items-center gap-2 text-xs text-white/60 mb-1">
          <button
            onClick={() => router.push("/quotes-bookings")}
            className="hover:text-white transition cursor-pointer"
          >
            Quotes & Bookings
          </button>
          <span>/</span>
          {quote.contact && (
            <>
              <span>
                {quote.contact.firstName} {quote.contact.lastName ?? ""}
              </span>
              <span>/</span>
            </>
          )}
          <span className="text-white/80">{quote.eventName}</span>
        </div>
        <h1 className="text-xl font-bold">
          {quote.contact ? `${quote.contact.firstName} ${quote.contact.lastName ?? ""} — ` : ""}
          {quote.eventName}
        </h1>
      </div>

      {/* Tab bar + actions */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="gap-0">
        <div className="border-b bg-white px-6 flex items-center justify-between">
          <TabsList className="bg-transparent h-auto p-0 gap-0 rounded-none">
            <TabsTrigger
              value="contract"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-darkBlue data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
            >
              Contract
            </TabsTrigger>
            <TabsTrigger
              value="billing"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-darkBlue data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
            >
              Billing
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-darkBlue data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
            >
              Files
            </TabsTrigger>
            <TabsTrigger
              value="log"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-darkBlue data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
            >
              Log
            </TabsTrigger>
            <TabsTrigger
              value="messages"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-darkBlue data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 py-3"
            >
              Messages
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3 py-2">
            <span className="text-sm font-bold">{formatMoney(contractTotalCents, currency)}</span>
            <span className="text-xs text-gray-500">Contract Total</span>
            {!isDeleted && (
              <>
                <button
                  onClick={handleOpenInDashboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Open in Dashboard
                </button>
                {canEditQuote && (
                  <button
                    onClick={() => router.push(`/quotes-bookings/${quote.id}/edit`)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
                  >
                    Edit
                  </button>
                )}
                {canEditQuote && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-sm hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                {canSend && (
                  <button
                    onClick={handleSendToClient}
                    className="px-3 py-1.5 text-sm font-semibold text-white bg-darkBlue rounded-sm hover:bg-lightBlue transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Send To Client
                  </button>
                )}
                {/* Review-request button disabled per boss feedback — kept for future use
                {!canSend && perms.isAccountManager && (
                  <button
                    onClick={handleRequestQuoteReview}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-300 rounded-sm hover:bg-amber-100 transition cursor-pointer"
                  >
                    <ClipboardCheck className="w-3.5 h-3.5" />
                    Request Review
                  </button>
                )} */}
              </>
            )}
          </div>
        </div>

        <div className="bg-white px-6 py-6 rounded-b-lg border border-t-0">
          <TabsContent value="contract">
            <ContractTab quote={quote} />
          </TabsContent>
          <TabsContent value="billing">
            <BillingTab
              quote={quote}
              contractTotalCents={contractTotalCents}
              canEdit={canEditQuote}
            />
          </TabsContent>
          <TabsContent value="files">
            <FilesTab quoteId={quote.id} />
          </TabsContent>
          <TabsContent value="log">
            <LogTab quoteId={quote.id} />
          </TabsContent>
          <TabsContent value="messages">
            <MessagesTab quoteId={quote.id} />
          </TabsContent>
        </div>
      </Tabs>
      <SendQuoteDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        eventId={eventId}
        recipientEmails={sendRecipients}
        onSent={() =>
          logQuoteSentLocal({
            eventId,
            recipientLine: sendRecipients.join(","),
            currentUserUuid: perms.userId,
          })
        }
      />
    </div>
  );
}
