"use client";

import { Check, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useEventsBleachers } from "../hooks/useEventsBleachers";
import { useEventsStartingInWeek } from "../hooks/useEventsStartingInWeek";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { EventDetails } from "./EventDetails";

/**
 * Every booked event that starts in the selected week. A check means the bleachers selected are
 * exactly what the event requires, by type; click an event to see both.
 */
export function EventBleacherRequirementsTab() {
  const [weekStart] = useSelectedWeek();
  const { events, isLoading } = useEventsStartingInWeek(weekStart);
  const { byEvent } = useEventsBleachers(events.map((e) => e.id));

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
        <p className="text-sm text-gray-500">No events start this week.</p>
      )}
    </>
  );
}
