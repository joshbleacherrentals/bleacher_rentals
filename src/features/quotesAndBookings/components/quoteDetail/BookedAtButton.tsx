"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { DateTime } from "luxon";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../../../database.types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { TaskMonthGrid } from "@/features/accountantCollections/components/TaskDatePicker";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { changeBookedAt } from "../../db/changeBookedAt";
import { bookedAtDay, formatBookedDay } from "../../utils/bookedAt";

/**
 * Saves the day picked in the calendar. Shows only an error toast, when it fails; a pick of the day
 * the quote already has writes nothing and is not an error. Returns whether the window may close.
 */
export async function saveBookedDay(params: {
  eventId: string;
  bookedAt: string | null;
  day: string;
  timezone: string;
  supabase: SupabaseClient<Database>;
  userId: string | null;
}): Promise<boolean> {
  try {
    await changeBookedAt(
      {
        eventId: params.eventId,
        from: params.bookedAt,
        day: params.day,
        timezone: params.timezone,
      },
      params.supabase,
      params.userId,
    );
    return true;
  } catch (error) {
    createErrorToastNoThrow([(error as Error).message || "Could not change the booked date."]);
    return false;
  }
}

/**
 * The booked date of a booked quote, as a button in the Contract tab's action row: `Booked: Nov 12,
 * 2026`. Clicking it opens a month calendar; clicking a day saves it at once and closes the window.
 * It puts back the date an event lost when it moved between statuses (changeQuoteStatus clears
 * `booked_at`). The page draws it only for a booked quote, for whoever may edit the quote.
 * The day is read and picked in the app's timezone (utils/bookedAt).
 */
export function BookedAtButton({
  eventId,
  bookedAt,
  supabase,
  userId,
}: {
  eventId: string;
  /** `Events.booked_at`, as stored. */
  bookedAt: string | null;
  supabase: SupabaseClient<Database>;
  userId: string | null;
}) {
  const timezone = useTimezoneStore((state) => state.timezone);
  const day = bookedAtDay(bookedAt, timezone);
  const today = DateTime.now().setZone(timezone).toFormat("yyyy-MM-dd");

  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((day ?? today).slice(0, 7));
  const [saving, setSaving] = useState(false);

  const onOpenChange = (next: boolean) => {
    // Open on the month of the booked day, not wherever the arrows last left it.
    if (next) setMonth((day ?? today).slice(0, 7));
    setOpen(next);
  };

  const pick = async (picked: string) => {
    if (saving) return;
    setSaving(true);
    const done = await saveBookedDay({
      eventId,
      bookedAt,
      day: picked,
      timezone,
      supabase,
      userId,
    });
    setSaving(false);
    if (done) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
        >
          <CalendarDays className="w-4 h-4" aria-hidden />
          {`Booked: ${formatBookedDay(day)}`}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Choose the booked date" className="w-auto p-3">
        <TaskMonthGrid
          month={month}
          today={today}
          selected={day ?? ""}
          allowPast
          onMonthChange={setMonth}
          onPick={pick}
        />
      </PopoverContent>
    </Popover>
  );
}
