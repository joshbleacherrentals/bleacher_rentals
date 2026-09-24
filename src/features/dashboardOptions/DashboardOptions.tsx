"use client";
import React from "react";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from "@/components/ui/menubar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MultiSelect } from "@/components/MultiSelect";
import { useDashboardFilterSettings } from "./useDashboardFilterSettings";
import type { YAxis } from "./types";
import { useCurrentEventStore } from "../eventConfiguration/state/useCurrentEventStore";
import { getRowOptions, getStateProvOptions } from "../dashboard/functions";

export function DashboardOptions() {
  const { state, setField } = useDashboardFilterSettings();
  const isFormExpanded = useCurrentEventStore((s) => s.isFormExpanded);

  const yAxis = state?.yAxis ?? "Bleachers";
  const rows = state?.rows ?? [];
  const stateProvinces = state?.stateProvinces ?? [];
  const onlyShowMyEvents = state?.onlyShowMyEvents ?? true;
  const optimizationMode = state?.optimizationMode ?? false;
  const showAddressTooltip = state?.showAddressTooltip ?? false;
  const showDistanceTooltip = state?.showDistanceTooltip ?? false;
  const hideAllSubrentals = state?.hideAllSubrentals ?? false;

  // Address & Distance tooltips are mutually exclusive: enabling one disables the other.
  const handleAddressTooltip = (checked: boolean) => {
    void setField("showAddressTooltip", checked);
    if (checked) void setField("showDistanceTooltip", false);
  };
  const handleDistanceTooltip = (checked: boolean) => {
    void setField("showDistanceTooltip", checked);
    if (checked) void setField("showAddressTooltip", false);
  };

  // Options
  const rowOptions = getRowOptions();
  const stateProvOptions = getStateProvOptions();

  // Modals
  const [openRows, setOpenRows] = React.useState(false);
  const [openRegions, setOpenRegions] = React.useState(false);

  // One-time defaults
  const [initialized, setInitialized] = React.useState(false);
  React.useEffect(() => {
    if (initialized) return;
    if (rowOptions.length === 0 || stateProvOptions.length === 0) return;
    setInitialized(true);
    const allRowVals = rowOptions.map((o) => o.value);
    const allStates = stateProvOptions.map((o) => o.value);
    if (!state) return;

    if (rows.length === 0) void setField("rows", allRowVals);
    if (stateProvinces.length === 0) void setField("stateProvinces", allStates);
  }, [
    initialized,
    rowOptions,
    stateProvOptions,
    setField,
    state,
    rows.length,
    stateProvinces.length,
  ]);

  return (
    <>
      <Menubar>
        <MenubarMenu>
          <MenubarTrigger>Options</MenubarTrigger>
          <MenubarContent>
            {/* Y-Axis selection (respect same behavior as previous Dropdown); hidden when form expanded */}
            {!isFormExpanded && (
              <MenubarSub>
                <MenubarSubTrigger inset>Y-Axis</MenubarSubTrigger>
                <MenubarSubContent>
                  <MenubarRadioGroup
                    value={yAxis}
                    onValueChange={(val) => void setField("yAxis", val as YAxis)}
                  >
                    <MenubarRadioItem value="Bleachers">Bleachers</MenubarRadioItem>
                    <MenubarRadioItem value="Events">Events</MenubarRadioItem>
                  </MenubarRadioGroup>
                </MenubarSubContent>
              </MenubarSub>
            )}

            {/* Filter By submenu */}
            <MenubarSub>
              <MenubarSubTrigger inset>Filter By</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem onClick={() => setOpenRows(true)}>
                  Rows<MenubarShortcut>(Bleachers)</MenubarShortcut>
                </MenubarItem>
                <MenubarItem onClick={() => setOpenRegions(true)}>
                  States / Provinces<MenubarShortcut>(Events)</MenubarShortcut>
                </MenubarItem>
              </MenubarSubContent>
            </MenubarSub>

            <MenubarSeparator />
            <MenubarCheckboxItem
              checked={optimizationMode}
              onCheckedChange={(checked) => void setField("optimizationMode", Boolean(checked))}
            >
              Optimization Mode
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={onlyShowMyEvents}
              onCheckedChange={(checked) => void setField("onlyShowMyEvents", Boolean(checked))}
            >
              Only Show My Events
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={hideAllSubrentals}
              onCheckedChange={(checked) => void setField("hideAllSubrentals", Boolean(checked))}
              title="Hides every subrental row on the grid, whatever dates you're looking at."
            >
              Hide all Subrentals
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={showAddressTooltip}
              onCheckedChange={(checked) => handleAddressTooltip(Boolean(checked))}
              title="This will display the last address for each bleacher based on the cell you're hovering over."
            >
              Show Address Tooltip
            </MenubarCheckboxItem>
            <MenubarCheckboxItem
              checked={showDistanceTooltip}
              onCheckedChange={(checked) => handleDistanceTooltip(Boolean(checked))}
              title="This will display the distance between each bleacher's last and next location based on the cell you're hovering over."
            >
              Show Distance Tooltip
            </MenubarCheckboxItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      {/* Rows modal */}
      <Dialog open={openRows} onOpenChange={setOpenRows}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rows</DialogTitle>
          </DialogHeader>
          <MultiSelect
            options={rowOptions.map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            onValueChange={(value) => {
              const nextRows = value.map(Number);
              void setField("rows", nextRows);
              const quick =
                nextRows.length === 1 && (nextRows[0] === 10 || nextRows[0] === 15)
                  ? nextRows[0]
                  : null;
              void setField("rowsQuickFilter", quick as any);
            }}
            forceSelectedValues={rows.map(String)}
            placeholder="Rows"
            variant="inverted"
            maxCount={1}
          />
        </DialogContent>
      </Dialog>

      {/* Regions modal */}
      <Dialog open={openRegions} onOpenChange={setOpenRegions}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>States & Provinces</DialogTitle>
          </DialogHeader>
          <MultiSelect
            options={stateProvOptions.map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            onValueChange={(value) => void setField("stateProvinces", value.map(Number))}
            forceSelectedValues={stateProvinces.map(String)}
            placeholder="States & Provinces"
            variant="inverted"
            maxCount={1}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
