"use client";

import { fetchVenueEvents } from "../../../db/fetchVenueEvents";
import { EventHistorySheet } from "./EventHistorySheet";

export function VenueHistorySheet({
  venueId,
  venueName,
  open,
  onOpenChange,
}: {
  venueId: string;
  venueName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <EventHistorySheet
      title={venueName}
      subtitle="Past and future events at this venue"
      open={open}
      onOpenChange={onOpenChange}
      fetchEvents={() => fetchVenueEvents(venueId)}
    />
  );
}
