"use client";

import { useVenueEvents } from "../../../hooks/useVenueEvents";
import { EventHistorySheet } from "./EventHistorySheet";

type Props = {
  venueId: string;
  venueName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Past and future events at a venue. Closed, it is nothing and watches nothing; open, it watches
 * the venue's events, so the lists follow an edit made in another tab
 * (docs/specs/quote-detail-03-history-panels.md).
 */
export function VenueHistorySheet({ open, ...rest }: Props) {
  if (!open) return null;
  // Keyed by venue: if the quote's venue changes while the panel is open, the panel starts over
  // instead of showing the previous venue's events under the new name.
  return <OpenVenueHistory key={rest.venueId} {...rest} />;
}

function OpenVenueHistory({ venueId, venueName, onOpenChange }: Omit<Props, "open">) {
  const { buckets, isLoading } = useVenueEvents(venueId);

  return (
    <EventHistorySheet
      title={venueName}
      subtitle="Past and future events at this venue"
      open
      onOpenChange={onOpenChange}
      buckets={buckets}
      isLoading={isLoading}
    />
  );
}
