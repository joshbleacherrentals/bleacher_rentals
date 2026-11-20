"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusPill } from "../utils/repairFormat";
import type { RepairStatus } from "../utils/repairRows";
import { REPAIR_STATUSES, statusMenuEntries } from "../utils/repairStatus";
import { StatusPill } from "./RepairChips";

/**
 * The status pill of a repair as a menu: the pill with a chevron is the button, and its six entries
 * are the statuses, each with a dot in its colour and the current one ticked. Choosing one calls
 * `onChange`; choosing the current one calls it too and the write finds nothing to do. The list is
 * drawn in a portal, so the clicks inside it are stopped here: they must not reach the row that
 * holds the pill (React sends the events of a portal to the parents of the component).
 * docs/specs/repairs-08-status.md §2.2 and §3 (D17, D74; the looks are the canvas's `StatusMenu`).
 */

export type RepairStatusMenuProps = {
  status: string;
  /** Names the repair for the `aria-label`: "repair JJ-5", "repair of bleacher #52, #53" or "repair". */
  repairLabel: string;
  onChange: (to: RepairStatus) => void;
};

const isRepairStatus = (value: string): value is RepairStatus =>
  (REPAIR_STATUSES as readonly string[]).includes(value);

export function RepairStatusMenu({ status, repairLabel, onChange }: RepairStatusMenuProps) {
  const entries = statusMenuEntries(status);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="repair-status-menu"
          aria-label={`Change status of ${repairLabel}, now ${statusPill(status).label}`}
          // The row toggles on a click too; opening the menu must not.
          onClick={(event) => event.stopPropagation()}
          className="cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none"
        >
          <StatusPill status={status} chevron />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[11rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuRadioGroup
          value={status}
          onValueChange={(value) => {
            if (isRepairStatus(value)) onChange(value);
          }}
        >
          {entries.map((entry) => (
            <DropdownMenuPrimitive.RadioItem
              key={entry.status}
              value={entry.status}
              data-testid="repair-status-option"
              data-status={entry.status}
              className="focus:bg-accent focus:text-accent-foreground relative flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none"
            >
              <span
                className={`size-2.5 shrink-0 rounded-full ${entry.dotClassName}`}
                aria-hidden="true"
              />
              <span className="flex-1">{entry.label}</span>
              <DropdownMenuPrimitive.ItemIndicator>
                <Check className="size-4 text-[#10365a]" aria-hidden="true" />
              </DropdownMenuPrimitive.ItemIndicator>
            </DropdownMenuPrimitive.RadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
