"use client";

import { useMemo } from "react";
import { useContactEvents } from "../../../hooks/useContactEvents";
import { EventHistorySheet, type HistoryEvent } from "./EventHistorySheet";

type Props = {
  contactId: string;
  contactName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Past and future events of a contact. Closed, it is nothing and watches nothing; open, it watches
 * the contact's events, so the lists follow an edit made in another tab
 * (docs/specs/quote-detail-03-history-panels.md).
 */
export function ContactHistorySheet({ open, ...rest }: Props) {
  if (!open) return null;
  // Keyed by contact: if the quote's contact changes while the panel is open, the panel starts
  // over instead of showing the previous contact's events under the new name.
  return <OpenContactHistory key={rest.contactId} {...rest} />;
}

function OpenContactHistory({ contactId, contactName, onOpenChange }: Omit<Props, "open">) {
  const { buckets, isLoading } = useContactEvents(contactId);

  // Each event says why it matched this contact, as a small badge.
  const tagged = useMemo(() => {
    if (!buckets) return null;
    const withTag = (events: typeof buckets.past): HistoryEvent[] =>
      events.map((e) => ({ ...e, tag: e.relation }));
    return { past: withTag(buckets.past), future: withTag(buckets.future) };
  }, [buckets]);

  return (
    <EventHistorySheet
      title={contactName}
      subtitle="Past and future events for this contact"
      open
      onOpenChange={onOpenChange}
      buckets={tagged}
      isLoading={isLoading}
    />
  );
}
