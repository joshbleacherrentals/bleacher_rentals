"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useBleacherBookings } from "../hooks/useBleacherBookings";
import { useSelectedWeek } from "../hooks/useSelectedWeek";
import { findOverbookedBleachers } from "../utils/overbooked";
import { OverbookedBleacherDetails } from "./OverbookedBleacherDetails";

/**
 * The bleachers booked on two events that overlap in the selected week, each opening to show which
 * events clash and on which days. When there are none, says so.
 */
export function OverbookedBleachersTab() {
  const [weekStart] = useSelectedWeek();
  const { bookings, isLoading } = useBleacherBookings(weekStart);
  const overbooked = useMemo(
    () => findOverbookedBleachers(bookings, weekStart),
    [bookings, weekStart],
  );

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;

  if (overbooked.length === 0) {
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800"
        data-testid="no-overbooked-bleachers"
      >
        <Check className="h-5 w-5" />
        No overbooked bleachers this week.
      </div>
    );
  }

  return (
    <Accordion type="multiple" data-testid="overbooked-bleachers">
      {overbooked.map((bleacher) => (
        <AccordionItem key={bleacher.bleacherUuid} value={bleacher.bleacherUuid}>
          <AccordionTrigger className="py-2">
            <span className="flex items-center gap-2">
              <X className="h-4 w-4 text-red-600" aria-label="Overbooked" />
              <span>
                #{bleacher.bleacherNumber} · {bleacher.bleacherTypeName ?? "No type"}
              </span>
              <span className="font-normal text-gray-500">
                {bleacher.conflicts.length} overlap{bleacher.conflicts.length === 1 ? "" : "s"}
              </span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <OverbookedBleacherDetails bleacher={bleacher} />
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
