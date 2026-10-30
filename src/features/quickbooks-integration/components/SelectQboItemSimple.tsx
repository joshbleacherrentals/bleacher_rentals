"use client";

import { useState, useMemo } from "react";
import { ChevronsUpDown, Check } from "lucide-react";
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
import { fetchQboItems, type QboItem } from "@/features/quickbooks-integration/api";
import { QboConnectionError } from "@/features/quickbooks-integration/components/QboConnectionError";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * A searchable select of a connection's QuickBooks Products/Services. `value` is the stored Item
 * id; one that is not in the list (the Item was made inactive or deleted) is shown as it is.
 * Spec: docs/specs/qbo-invoice-12-event-type-services.md
 */

type SelectQboItemSimpleProps = {
  value: string | null;
  onChange: (itemId: string | null) => void;
  connectionId: string;
  placeholder?: string;
  disabled?: boolean;
};

const labelOf = (item: QboItem) => item.fullyQualifiedName || item.name || `Item ${item.id}`;

export function SelectQboItemSimple({
  value,
  onChange,
  connectionId,
  placeholder = "Select QuickBooks Product/Service...",
  disabled = false,
}: SelectQboItemSimpleProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const {
    data: items = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["qbo-items", connectionId],
    queryFn: () => fetchQboItems(connectionId),
    staleTime: 0,
    gcTime: Infinity,
    refetchOnMount: true,
    placeholderData: (previousData) => previousData,
  });

  const filteredItems = useMemo(() => {
    if (!search) return items;
    const searchLower = search.toLowerCase();
    return items.filter((item) => labelOf(item).toLowerCase().includes(searchLower));
  }, [items, search]);

  const selectedItem = items.find((item) => item.id === value);
  const selectedLabel = selectedItem ? labelOf(selectedItem) : (value ?? "");

  if (error) {
    return <QboConnectionError />;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between text-left font-normal"
          disabled={disabled || isLoading}
        >
          {isLoading ? (
            <span className="text-gray-500">Loading products/services...</span>
          ) : value ? (
            <span>{selectedLabel}</span>
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by name..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No product or service found.</CommandEmpty>
            <CommandGroup>
              {filteredItems.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => {
                    onChange(item.id === value ? null : item.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")}
                  />
                  {labelOf(item)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
