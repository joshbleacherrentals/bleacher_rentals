"use client";

import { Calendar, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PeriodOption } from "../utils/periodOptions";

// docs/specs/dashboard-analytics-05-page.md §2.2, R3 and the board YearMenu. The app's own
// DropdownMenu with a radio group, so its keyboard behaviour (arrows, Enter, Escape, type to find),
// its focus ring and the closing on a choice or a click outside come with it. The chosen option has a
// tick at its right, drawn here in place of the radio dot at the left.

type PeriodDropdownProps = {
  /** The text on the button: the chosen year, or "All time". */
  label: string;
  options: PeriodOption[];
  onChange: (value: string) => void;
};

export function PeriodDropdown({ label, options, onChange }: PeriodDropdownProps) {
  const chosen = options.find((option) => option.checked)?.value ?? "";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Period"
          className="box-border inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-[#d1d5db] bg-white px-3 text-sm leading-5 font-semibold text-darkBlue hover:bg-[#f3f4f6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-darkBlue"
        >
          <Calendar aria-hidden="true" className="size-4 text-[#6b7280]" />
          <span>{label}</span>
          <ChevronDown aria-hidden="true" className="size-4 text-[#6b7280]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-[180px] min-w-0 rounded-lg border-[#e5e7eb] bg-white px-0 py-1 shadow-[0_10px_24px_rgba(16,54,90,0.14)]"
      >
        <DropdownMenuRadioGroup value={chosen} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              className="h-9 justify-between rounded-none px-3 py-0 text-sm leading-5 text-[#111827] focus:bg-[#f3f4f6] focus:text-[#111827] [&>span:first-child]:hidden"
            >
              <span>{option.label}</span>
              {option.checked && (
                <Check
                  data-testid="period-tick"
                  aria-hidden="true"
                  className="size-4 text-darkBlue"
                />
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
