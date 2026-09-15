"use client";

import { cn } from "@/lib/utils";
import type { VenuePickerValue } from "@/features/venues/types";

type VenueCardProps = {
  value: VenuePickerValue;
  onClick?: () => void;
  className?: string;
};

/**
 * Read-only 4-line display of a venue (Name / Street / City, State / Zip) —
 * or 3 lines (no bold name) for a manually-typed address with no linked
 * Venue. `onClick` decides whether it's a button (opens the picker modal, or
 * whatever the caller wants — e.g. the Contract tab's history sheet) or a
 * plain static card.
 */
export function VenueCard({ value, onClick, className }: VenueCardProps) {
  const address = value.address;
  const name = value.mode === "venue" ? value.name : null;

  const Element = onClick ? "button" : "div";

  return (
    <Element
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-md border px-3 py-2.5 text-left transition",
        onClick && "cursor-pointer hover:bg-gray-50 hover:border-gray-300",
        className,
      )}
    >
      {!address ? (
        <span className="text-sm text-gray-400">Select venue...</span>
      ) : (
        <div className="space-y-0.5">
          {name && <div className="text-sm font-semibold text-darkBlue">{name}</div>}
          <div className={cn("text-sm", name ? "text-gray-600" : "font-medium text-gray-900")}>
            {address.street}
          </div>
          {(address.city || address.stateProvince) && (
            <div className="text-sm text-gray-600">
              {[address.city, address.stateProvince].filter(Boolean).join(", ")}
            </div>
          )}
          {address.zipPostal && <div className="text-sm text-gray-600">{address.zipPostal}</div>}
        </div>
      )}
    </Element>
  );
}
