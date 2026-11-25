"use client";

import { Check, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useChecks } from "@/features/autoWorkTrackers/components/ChecksProvider";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { EventDetails } from "./EventDetails";

/**
 * Every booked event that starts in the selected week with a bleacher from the selected zone. A check means the bleachers selected are
 * exactly what the event requires, by type; click an event to see both.
 */
export function EventBleacherRequirementsTab() {
  const { zoneId } = useZoneWeekParams();
  const { events, byEvent, isLoading } = useChecks().eventBleacherRequirements;

  if (!zoneId) {
    return <p className="text-sm text-gray-500">Select a zone to see its events.</p>;
  }

  return (
    <>
      <Accordion type="multiple" data-testid="schedule-validator-events">
        {events.map((event) => (
          <AccordionItem key={event.id} value={event.id}>
            <AccordionTrigger className="py-2">
              <span className="flex items-center gap-2">
                {byEvent.get(event.id)?.matches ? (
                  <Check className="h-4 w-4 text-green-600" aria-label="Bleachers match" />
                ) : (
                  <X className="h-4 w-4 text-red-600" aria-label="Bleachers do not match" />
                )}
                {event.name}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <EventDetails bleachers={byEvent.get(event.id)!} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {!isLoading && events.length === 0 && (
        <p className="text-sm text-gray-500">
          No events with this zone's bleachers start this week.
        </p>
      )}
    </>
  );
}
