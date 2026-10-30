"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The date of the next task: a button that opens a month grid. There is no calendar component in
 * the app, so the grid is built here from the design (Sunday first, past days off, today ringed,
 * the chosen day filled), with arrows between months. All dates are `YYYY-MM-DD`, months
 * `YYYY-MM`. docs/specs/accountant-collections-09-design.md §3.
 */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function firstOf(month: string): DateTime {
  return DateTime.fromISO(`${month}-01`, { zone: "utc" }).setLocale("en-US");
}

export function shiftMonth(month: string, delta: number): string {
  return firstOf(month).plus({ months: delta }).toFormat("yyyy-MM");
}

export function monthTitle(month: string): string {
  return firstOf(month).toFormat("MMMM yyyy");
}

/** The days of a month in order, `null` for the blanks before the 1st (weeks start on Sunday). */
export function monthCells(month: string): (string | null)[] {
  const first = firstOf(month);
  const blanks = first.weekday % 7; // luxon: Monday 1 … Sunday 7
  const days = Array.from({ length: first.daysInMonth ?? 0 }, (_, i) =>
    first.plus({ days: i }).toFormat("yyyy-MM-dd"),
  );
  return [...Array<null>(blanks).fill(null), ...days];
}

function dayLabel(date: string): string {
  return DateTime.fromISO(date, { zone: "utc" }).setLocale("en-US").toFormat("MMMM d, yyyy");
}

export function TaskMonthGrid({
  month,
  today,
  selected,
  onPick,
  onMonthChange,
}: {
  month: string;
  today: string;
  selected: string;
  onPick: (date: string) => void;
  onMonthChange: (month: string) => void;
}) {
  const arrow =
    "inline-flex size-7 items-center justify-center rounded-md text-gray-600 hover:bg-gray-100";
  return (
    <div>
      <div className="flex items-center justify-between pb-3">
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, -1))}
          disabled={month <= today.slice(0, 7)}
          aria-label="Previous month"
          className={arrow}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <div className="text-sm font-semibold">{monthTitle(month)}</div>
        <button
          type="button"
          onClick={() => onMonthChange(shiftMonth(month, 1))}
          aria-label="Next month"
          className={arrow}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
      <div
        aria-hidden="true"
        className="mb-1 grid grid-cols-[repeat(7,36px)] gap-0.5 text-center text-xs text-gray-500"
      >
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(7,36px)] gap-0.5">
        {monthCells(month).map((date, i) => {
          if (date === null) return <span key={`blank-${i}`} aria-hidden="true" />;
          const past = date < today;
          const isSelected = date === selected;
          const isToday = date === today;
          const look = isSelected
            ? "bg-darkBlue font-semibold text-white"
            : past
              ? "cursor-default text-gray-400"
              : `text-gray-900 hover:bg-gray-100 ${isToday ? "ring-1 ring-inset ring-darkBlue" : ""}`;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onPick(date)}
              disabled={past}
              aria-label={dayLabel(date)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={`h-9 rounded-md text-sm ${look}`}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TaskDatePicker({
  value,
  today,
  label,
  onChange,
}: {
  value: string;
  today: string;
  /** What the button says: `Today`, `1 Day`, `N Days`. */
  label: string;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || today).slice(0, 7));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Open on the month of the chosen day, not wherever the arrows last left it.
        if (next) setMonth((value || today).slice(0, 7));
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          <CalendarDays className="size-4" aria-hidden />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Choose the date for the next task"
        className="w-auto p-3"
      >
        <TaskMonthGrid
          month={month}
          today={today}
          selected={value}
          onMonthChange={setMonth}
          onPick={(date) => {
            onChange(date);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
