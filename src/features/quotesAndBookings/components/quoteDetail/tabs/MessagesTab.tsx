"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EventInternalChat } from "@/features/eventChat/components/EventInternalChat";
import type { QuotesBookingsCapabilities } from "@/features/userAccess/logic/getQuotesBookingsCapabilities";

/**
 * Messages tab on quote detail — split into Internal (team chat) and External (client email, future).
 * quoteId is the event uuid; internal chat is scoped one thread per event.
 */
export function MessagesTab({
  quoteId,
  can,
}: {
  quoteId: string;
  can: Pick<QuotesBookingsCapabilities, "useInternalChat">;
}) {
  return (
    <Tabs defaultValue="internal">
      <TabsList className="bg-gray-100 p-1 rounded-lg h-auto gap-0 w-auto inline-flex mb-5">
        <TabsTrigger
          value="internal"
          className="rounded-md text-sm px-5 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 font-medium transition-all"
        >
          Internal
        </TabsTrigger>
        <TabsTrigger
          value="external"
          className="rounded-md text-sm px-5 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 text-gray-500 font-medium transition-all"
        >
          External
        </TabsTrigger>
      </TabsList>

      {/* Internal: admin/AM team chat — not visible on public quote page */}
      <TabsContent value="internal">
        {can.useInternalChat ? (
          <EventInternalChat eventUuid={quoteId} />
        ) : (
          <p className="text-sm text-gray-500 py-8 text-center">
            Internal chat is available to admins and account managers only.
          </p>
        )}
      </TabsContent>

      {/* External: client-facing messaging — placeholder until Gmail integration */}
      <TabsContent value="external">
        <p className="text-sm text-gray-400 py-8 text-center">External messaging coming soon.</p>
      </TabsContent>
    </Tabs>
  );
}
