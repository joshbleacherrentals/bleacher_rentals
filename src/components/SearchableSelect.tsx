"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableSelectOption = {
  /** Stable id stored as the selected value. */
  value: string;
  /** Text shown in the trigger and the list row. */
  label: string;
  /**
   * Optional extra text matched while searching (e.g. email/phone) so a row is
   * findable even when it isn't part of the visible label.
   */
  searchValue?: string;
};

type SearchableSelectProps = {
  options: SearchableSelectOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Pinned action rendered as the last row of the list — e.g. "+ Add new contact".
   * Deliberately outside the filtered group so it stays reachable when the search
   * matches nothing, which is exactly when it is most useful.
   */
  footerItem?: { label: string; onSelect: () => void };
  /** Overrides the trigger text while `selected` is null (legacy free-text values). */
  fallbackLabel?: string | null;
  /** Fires on every keystroke in the search box — e.g. to pre-fill a "+ Add new" form's name field with whatever was typed. */
  onSearchChange?: (query: string) => void;
};

/**
 * Single-select dropdown with a type-to-filter search box. Drop-in replacement
 * for {@link Dropdown} when the option list can grow large (e.g. thousands of
 * contacts/companies). Built on cmdk so filtering scales without rendering every
 * row up front.
 */
export function SearchableSelect({
  options,
  selected,
  onSelect,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyMessage = "No results found.",
  disabled = false,
  className,
  footerItem,
  fallbackLabel = null,
  onSearchChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);

  const selectedOption = options.find((o) => o.value === selected);
  const triggerLabel = selectedOption?.label ?? fallbackLabel;

  const handleSelect = (value: string) => {
    onSelect(value === selected ? null : value);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full h-[40px] justify-between overflow-hidden text-left font-normal disabled:opacity-100",
            disabled && "bg-gray-50 text-gray-700 cursor-default",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !triggerLabel && "text-gray-500")}>
            {triggerLabel ?? placeholder}
          </span>
          {!disabled && (
            <div className="flex shrink-0 items-center gap-1">
              {(selected || fallbackLabel) && (
                <span
                  role="button"
                  tabIndex={0}
                  className="opacity-50 hover:opacity-100 transition-opacity"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(null);
                    setOpen(false);
                  }}
                  aria-label="Clear selection"
                >
                  <X className="h-4 w-4" />
                </span>
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} onValueChange={onSearchChange} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={`${option.label} ${option.searchValue ?? ""}`}
                  onSelect={() => handleSelect(option.value)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selected === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {footerItem && (
              <CommandGroup className="border-t" forceMount>
                <CommandItem
                  forceMount
                  value="__footer_action__"
                  onSelect={() => {
                    setOpen(false);
                    footerItem.onSelect();
                  }}
                  className="text-darkBlue font-medium"
                >
                  {footerItem.label}
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
