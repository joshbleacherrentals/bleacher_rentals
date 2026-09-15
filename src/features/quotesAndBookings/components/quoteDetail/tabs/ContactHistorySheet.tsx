"use client";

import { fetchContactEvents } from "../../../db/fetchContactEvents";
import { EventHistorySheet, type HistoryEventBuckets } from "./EventHistorySheet";

export function ContactHistorySheet({
  contactId,
  contactName,
  open,
  onOpenChange,
}: {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <EventHistorySheet
      title={contactName}
      subtitle="Past and future events for this contact"
      open={open}
      onOpenChange={onOpenChange}
      fetchEvents={async (): Promise<HistoryEventBuckets> => {
        const { past, future } = await fetchContactEvents(contactId);
        const withTag = (events: typeof past) => events.map((e) => ({ ...e, tag: e.relation }));
        return { past: withTag(past), future: withTag(future) };
      }}
    />
  );
}
