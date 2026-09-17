"use client";

import { Pencil } from "lucide-react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkTrackerTypeSelect } from "./WorkTrackerTypeSelect";
import type { WorkTrackerTypeOption } from "../hooks/useWorkTrackerTypes";

type WorkTrackerTabsHeaderProps = {
  types: WorkTrackerTypeOption[];
  selectedTypeId: string | null | undefined;
  onSelectType: (id: string) => void;
  disabled: boolean;
  isAdmin: boolean;
  onEditTypesClick: () => void;
};

/**
 * Pinned row above the Details/Line Items tab content: the tab switch and the
 * Work Tracker Type selector (its own color-coded switch rather than a form
 * field, since the choice drives which fields the Details tab shows — Trip's
 * separate Pickup/Dropoff sections vs. everything else's single field set).
 * Must render as a child of <Tabs> so TabsList shares its context.
 */
export function WorkTrackerTabsHeader({
  types,
  selectedTypeId,
  onSelectType,
  disabled,
  isAdmin,
  onEditTypesClick,
}: WorkTrackerTabsHeaderProps) {
  return (
    <div className="flex items-center justify-between shrink-0">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="line-items">Line Items</TabsTrigger>
      </TabsList>
      <div className="flex items-center gap-2">
        <WorkTrackerTypeSelect
          types={types}
          selectedId={selectedTypeId}
          onSelect={onSelectType}
          disabled={disabled}
        />
        {/* QBO account assignment for the 3 fixed types now lives on its own
            admin-only page, not a modal here. */}
        {isAdmin && (
          <button
            type="button"
            onClick={onEditTypesClick}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit types
          </button>
        )}
      </div>
    </div>
  );
}
