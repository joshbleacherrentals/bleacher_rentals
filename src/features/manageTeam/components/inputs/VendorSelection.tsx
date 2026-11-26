"use client";

import { useState } from "react";
import { VendorCard } from "../util/VendorCard";
import { useVendors } from "../../hooks/useVendors";
import { EditVendorModal } from "../EditVendorModal";
import { driverVendorChoices, type VendorOption } from "../../utils/vendorForm";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
} from "@/components/ui/command";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VendorSelectionProps {
  value: string | null;
  onChange: (vendorId: string | null) => void;
  driverType: "employee" | "contractor";
}

export function VendorSelection({ value, onChange, driverType }: VendorSelectionProps) {
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [vendorSearch, setVendorSearch] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorOption | null>(null);

  // Get vendors data. The selected card is looked up among all active vendors, so a driver whose
  // vendor was switched to Repairs still sees it (docs/specs/vendors-page.md D11).
  const { data: vendors = [] } = useVendors();
  const selectedVendor = vendors.find((v) => v.id === value);

  // Handle vendor edit
  const handleVendorEdit = (e: React.MouseEvent, vendor: VendorOption) => {
    e.stopPropagation();
    setEditingVendor(vendor);
    setIsEditModalOpen(true);
    setIsVendorDropdownOpen(false);
  };

  // Handle create new vendor
  const handleCreateVendor = () => {
    setEditingVendor(null);
    setIsEditModalOpen(true);
    setIsVendorDropdownOpen(false);
  };

  // The list to choose from: Driver vendors only, filtered by search (D11).
  const filteredVendors = driverVendorChoices(vendors, vendorSearch);

  // Vendor dropdown content (reused in both ghost and actual card)
  const vendorDropdownContent = (
    <PopoverContent className="w-[350px] p-0" align="start">
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search vendor..."
          value={vendorSearch}
          onValueChange={setVendorSearch}
        />
        <CommandList className="max-h-[300px]">
          {filteredVendors.length === 0 && <CommandEmpty>No vendor found.</CommandEmpty>}
          <CommandGroup>
            <div className="flex flex-col gap-2 p-1">
              {filteredVendors.map((vendor) => (
                <VendorCard
                  key={vendor.id}
                  displayName={vendor.displayName}
                  logoUrl={vendor.logoUrl}
                  driverCount={vendor.driverCount}
                  isSelected={value === vendor.id}
                  onClick={() => {
                    onChange(vendor.id);
                    setIsVendorDropdownOpen(false);
                  }}
                  onEdit={(e) => handleVendorEdit(e, vendor)}
                  qboVendorId={vendor.qboVendorId}
                />
              ))}
            </div>
          </CommandGroup>
        </CommandList>
        <div className="border-t p-2">
          <Button
            variant="outline"
            className="w-full justify-start text-greenAccent border-greenAccent/30 hover:bg-greenAccent/10 hover:text-greenAccent"
            onClick={handleCreateVendor}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create New Vendor Company
          </Button>
        </div>
      </Command>
    </PopoverContent>
  );

  return (
    <>
      {driverType === "employee" ? (
        // Ghost card for employees
        <div className="w-full h-[52px] rounded border border-gray-200 bg-gray-50 flex items-center justify-center px-3">
          <span className="text-sm text-gray-500 text-center">
            Vendors aren't required for in-house drivers.
          </span>
        </div>
      ) : !selectedVendor ? (
        // Red ghost card for contractors without vendor
        <Popover open={isVendorDropdownOpen} onOpenChange={setIsVendorDropdownOpen}>
          <PopoverTrigger asChild>
            <button className="w-full h-[52px] rounded border border-red-300 bg-red-50 flex items-center justify-center px-3 hover:bg-red-100 transition-colors cursor-pointer">
              <span className="text-sm text-red-700 font-medium text-center">
                Please Assign a Vendor.
              </span>
            </button>
          </PopoverTrigger>
          {vendorDropdownContent}
        </Popover>
      ) : (
        // Actual vendor card
        <Popover open={isVendorDropdownOpen} onOpenChange={setIsVendorDropdownOpen}>
          <PopoverTrigger asChild>
            <div className="cursor-pointer">
              <VendorCard
                displayName={selectedVendor.displayName}
                logoUrl={selectedVendor.logoUrl}
                driverCount={selectedVendor.driverCount}
                isSelected={true}
                onClick={() => setIsVendorDropdownOpen(true)}
                onEdit={(e) => handleVendorEdit(e, selectedVendor)}
                onDeselect={() => onChange(null)}
                qboVendorId={selectedVendor.qboVendorId}
              />
            </div>
          </PopoverTrigger>
          {vendorDropdownContent}
        </Popover>
      )}

      {/* Edit Vendor Modal */}
      <EditVendorModal
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingVendor(null);
        }}
        onSave={(vendorId) => {
          onChange(vendorId);
          setIsEditModalOpen(false);
        }}
        existingVendor={editingVendor}
        defaultType="driver"
      />
    </>
  );
}
