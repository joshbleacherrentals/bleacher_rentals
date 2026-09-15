"use client";

import InputPercents from "@/components/InputPercents";
import CentsInput from "@/components/CentsInput";
import { Dropdown } from "@/components/DropDown";
import { SelectDriverZones } from "@/features/manageTeam/components/inputs/SelectDriverZones";
import { DriverPayTrack } from "@/features/manageTeam/components/inputs/DriverPayTrack";
import { VendorSelection } from "@/features/manageTeam/components/inputs/VendorSelection";
import { useCurrentUserStore } from "@/features/manageTeam/state/useCurrentUserStore";
import AddressAutocomplete, { formatAddressLine } from "@/components/AddressAutoComplete";
import { DriverDocumentCard } from "@/features/manageTeam/components/inputs/DriverDocumentCard";
import { DRIVER_DOCUMENTS } from "@/features/manageTeam/logic/driverDocuments";
import { useTodayIso } from "@/features/manageTeam/hooks/useTodayIso";
import { useUserFormPaths } from "@/features/manageTeam/hooks/useUserFormPaths";
import { CountryIndicator } from "@/features/manageTeam/components/CountryIndicator";
import { useEditAccess } from "@/features/manageTeam/state/EditAccessContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";

const currencyOptions = [
  { label: "CAD", value: "CAD" },
  { label: "USD", value: "USD" },
];

const unitOptions = [
  { label: "KM", value: "KM" },
  { label: "MI", value: "MI" },
  { label: "HR", value: "HR" },
];

const driverTypeOptions = [
  { label: "Employee", value: "employee" },
  { label: "Contractor", value: "contractor" },
];

/** Flat currency input that resyncs its display when `cents` changes elsewhere. */
function DriverAmountInput({
  cents,
  ariaLabel,
  onChange,
}: {
  cents: number | null;
  ariaLabel: string;
  onChange: (cents: number | null) => void;
}) {
  const [display, setDisplay] = useState(cents != null ? (cents / 100).toFixed(2) : "");
  useEffect(() => {
    setDisplay(cents != null ? (cents / 100).toFixed(2) : "");
  }, [cents]);

  return (
    <CentsInput
      value={display}
      onChange={(nextDisplay, nextCents) => {
        setDisplay(nextDisplay);
        onChange(nextCents);
      }}
      placeholder="0.00"
      className="w-full rounded border px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
      ariaLabel={ariaLabel}
    />
  );
}

export function DriverPageContent() {
  const router = useRouter();
  const params = useParams();
  const userUuidFromUrl = params.userUuid as string | undefined;
  const { basicUserInfo } = useUserFormPaths();
  const roleTabs = useCurrentUserStore((s) => s.roleTabs);
  const vendorUuid = useCurrentUserStore((s) => s.vendorUuid);
  const setField = useCurrentUserStore((s) => s.setField);
  const existingUserUuid = useCurrentUserStore((s) => s.existingUserUuid);

  // In "zones-only" access the surrounding form is locked (pointer-events-none). Every field
  // except the zone multi-select is visually dimmed; the zone block re-enables interaction.
  const editAccess = useEditAccess();
  const zonesOnly = editAccess === "zones-only";
  const dimmed = zonesOnly ? "opacity-60" : "";

  useEffect(() => {
    // Don't redirect while loading:
    // - If we have a userUuid in the URL but roleTabs is empty, we're still loading
    // - If existingUserUuid is set but roleTabs is empty, we're still loading
    const isLoading = (userUuidFromUrl || existingUserUuid) && roleTabs.length === 0;

    if (!isLoading && !roleTabs.includes("driver")) {
      router.push(basicUserInfo);
    }
  }, [roleTabs, router, basicUserInfo, existingUserUuid, userUuidFromUrl]);

  // Driver type state (client-side only)
  const [driverType, setDriverType] = useState<"employee" | "contractor">("employee");

  // Initialize driver type based on existing vendorUuid
  useEffect(() => {
    if (vendorUuid) {
      setDriverType("contractor");
    }
  }, [vendorUuid]);

  // Handle driver type change
  const handleDriverTypeChange = (type: "employee" | "contractor") => {
    setDriverType(type);
    // Clear vendor if switching to employee
    if (type === "employee") {
      setField("vendorUuid", null);
    }
  };

  const taxDec = useCurrentUserStore((s) => s.taxDec);
  const payRateCents = useCurrentUserStore((s) => s.payRateCents);
  const deadheadRateCents = useCurrentUserStore((s) => s.deadheadRateCents);
  const setupCents = useCurrentUserStore((s) => s.setupCents);
  const teardownCents = useCurrentUserStore((s) => s.teardownCents);
  const payCurrency = useCurrentUserStore((s) => s.payCurrency);
  const payPerUnit = useCurrentUserStore((s) => s.payPerUnit);
  const payRanges = useCurrentUserStore((s) => s.payRanges);
  const assignedDriverZoneUuids = useCurrentUserStore((s) => s.assignedDriverZoneUuids);
  const phoneNumber = useCurrentUserStore((s) => s.phoneNumber);
  const homeAddress = useCurrentUserStore((s) => s.homeAddress);
  const homeCity = useCurrentUserStore((s) => s.homeCity);
  const homeState = useCurrentUserStore((s) => s.homeState);
  const homePostalCode = useCurrentUserStore((s) => s.homePostalCode);
  const vehicleMake = useCurrentUserStore((s) => s.vehicleMake);
  const vehicleModel = useCurrentUserStore((s) => s.vehicleModel);
  const vehicleYear = useCurrentUserStore((s) => s.vehicleYear);
  const vehicleVin = useCurrentUserStore((s) => s.vehicleVin);
  const licensePhotoPath = useCurrentUserStore((s) => s.licensePhotoPath);
  const insurancePhotoPath = useCurrentUserStore((s) => s.insurancePhotoPath);
  const medicalCardPhotoPath = useCurrentUserStore((s) => s.medicalCardPhotoPath);
  const licenseExpiresOn = useCurrentUserStore((s) => s.licenseExpiresOn);
  const insuranceExpiresOn = useCurrentUserStore((s) => s.insuranceExpiresOn);
  const medicalCardExpiresOn = useCurrentUserStore((s) => s.medicalCardExpiresOn);
  const driverId = useCurrentUserStore((s) => s.driverId);
  const todayIso = useTodayIso();

  // Detect USA states (normalized to lowercase for comparison)
  const usaStates = [
    "alabama",
    "alaska",
    "arizona",
    "arkansas",
    "california",
    "colorado",
    "connecticut",
    "delaware",
    "florida",
    "georgia",
    "hawaii",
    "idaho",
    "illinois",
    "indiana",
    "iowa",
    "kansas",
    "kentucky",
    "louisiana",
    "maine",
    "maryland",
    "massachusetts",
    "michigan",
    "minnesota",
    "mississippi",
    "missouri",
    "montana",
    "nebraska",
    "nevada",
    "new hampshire",
    "new jersey",
    "new mexico",
    "new york",
    "north carolina",
    "north dakota",
    "ohio",
    "oklahoma",
    "oregon",
    "pennsylvania",
    "rhode island",
    "south carolina",
    "south dakota",
    "tennessee",
    "texas",
    "utah",
    "vermont",
    "virginia",
    "washington",
    "west virginia",
    "wisconsin",
    "wyoming",
  ];
  const isUSADriver =
    homeState?.toLowerCase().includes("usa") ||
    homeState?.toLowerCase().includes("united states") ||
    usaStates.some((state) => homeState?.toLowerCase() === state);

  // Detect Canadian provinces (normalized to lowercase for comparison)
  const canadianProvinces = [
    "alberta",
    "british columbia",
    "manitoba",
    "new brunswick",
    "newfoundland and labrador",
    "newfoundland",
    "nova scotia",
    "northwest territories",
    "nunavut",
    "ontario",
    "prince edward island",
    "quebec",
    "saskatchewan",
    "yukon",
  ];
  const isCanadaDriver =
    homeState?.toLowerCase().includes("canada") ||
    canadianProvinces.some((prov) => homeState?.toLowerCase() === prov);

  // Storage path prefix matches driver app: `{driverId}/license_{ts}.ext`
  useEffect(() => {
    if (!driverId) {
      setField("driverId", crypto.randomUUID());
    }
  }, [driverId, setField]);

  const driverStoragePath = driverId || "temp-driver";

  // Indexed by the descriptor's field names so the document list can stay a map
  // over DRIVER_DOCUMENTS instead of three hand-written blocks.
  const documentValues = {
    licensePhotoPath,
    insurancePhotoPath,
    medicalCardPhotoPath,
    licenseExpiresOn,
    insuranceExpiresOn,
    medicalCardExpiresOn,
  };

  return (
    <div className="space-y-6">
      {/* Manager Setup Section */}
      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Manager Setup</h2>
          <p className="text-sm text-gray-600">
            This driver cannot set this information. You are required to input this info for the
            driver.
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_auto]">
            {/* Zones — stays interactive even when the rest of the form is locked. */}
            <div className={zonesOnly ? "pointer-events-auto" : ""}>
              <label className="mb-1 block text-sm font-medium text-gray-700">Zones</label>
              <SelectDriverZones
                value={assignedDriverZoneUuids}
                onChange={(value) => setField("assignedDriverZoneUuids", value)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Assign this driver to one or more zones. They will appear in Work Tracker driver
                lists for those zones.
              </p>
            </div>

            {/* Vendor Card / Ghost Card */}
            <div className={dimmed}>
              <label className="mb-1 block text-sm font-medium text-gray-700">Vendor Company</label>
              <VendorSelection
                value={vendorUuid}
                onChange={(value) => setField("vendorUuid", value)}
                driverType={driverType}
              />
            </div>

            {/* Driver Type Dropdown */}
            <div className={`lg:w-[180px] ${dimmed}`}>
              <label className="mb-1 block text-sm font-medium text-gray-700">Driver Type</label>
              <Dropdown
                options={driverTypeOptions}
                selected={driverType}
                onSelect={(value) => handleDriverTypeChange(value as "employee" | "contractor")}
                placeholder="Select Type"
              />
            </div>
          </div>

          {driverType === "contractor" && !vendorUuid && (
            <p className="text-xs text-red-600">
              Contractors must be assigned to a vendor company for payment tracking and QuickBooks
              integration.
            </p>
          )}
          {driverType === "contractor" && vendorUuid && (
            <p className="text-xs text-gray-500">
              Contractor is assigned to a vendor for payment tracking and QuickBooks integration.
            </p>
          )}
        </div>

        <div className={dimmed}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Currency</label>
              <Dropdown
                options={currencyOptions}
                selected={payCurrency}
                onSelect={(value) => setField("payCurrency", value as "CAD" | "USD")}
                placeholder="Select Currency"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Per Unit</label>
              <Dropdown
                options={unitOptions}
                selected={payPerUnit}
                onSelect={(value) => setField("payPerUnit", value as "KM" | "MI" | "HR")}
                placeholder="Select Unit"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tax</label>
              <div style={{ height: "calc(2.5rem + 0px)" }}>
                <InputPercents
                  value={taxDec ?? 0}
                  setValue={(value) => setField("taxDec", value)}
                  ariaLabel="Tax rate percent"
                />
              </div>
            </div>
          </div>

          <div className="mt-3">
            <DriverPayTrack
              payRateCents={payRateCents}
              payRanges={payRanges}
              onChange={(next) => {
                setField("payRateCents", next.payRateCents);
                setField("payRanges", next.payRanges);
              }}
              unit={payPerUnit}
              currency={payCurrency}
            />
            <p className="mt-1 text-xs text-gray-500">
              Rates are in {payCurrency} per {payPerUnit}
              {taxDec ? `, plus ${taxDec}% tax` : ""}.
            </p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Deadhead Rate</label>
              <DriverAmountInput
                cents={deadheadRateCents}
                ariaLabel={`Deadhead amount per ${payPerUnit}`}
                onChange={(cents) => setField("deadheadRateCents", cents)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Amount paid per {payPerUnit} for deadhead travel, in {payCurrency}.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Setup Pay</label>
              <DriverAmountInput
                cents={setupCents}
                ariaLabel="Setup pay amount"
                onChange={(cents) => setField("setupCents", cents)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Flat amount paid for installation, in {payCurrency}.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Teardown Pay</label>
              <DriverAmountInput
                cents={teardownCents}
                ariaLabel="Teardown pay amount"
                onChange={(cents) => setField("teardownCents", cents)}
              />
              <p className="mt-1 text-xs text-gray-500">
                Flat amount paid for dismantling, in {payCurrency}.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Driver Setup Section */}
      <section className={`space-y-4 rounded-lg border border-gray-200 bg-white p-4 ${dimmed}`}>
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Driver Setup</h2>
          <p className="text-sm text-gray-600">
            The Driver has the ability to set this data in their mobile application, so you&apos;re
            not required to fill this out if you don&apos;t want to.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Phone Number</label>
            <input
              type="tel"
              value={phoneNumber ?? ""}
              onChange={(e) => setField("phoneNumber", e.target.value || null)}
              className="w-full rounded border px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
              placeholder="(123) 456-7890"
            />
          </div>

          <div>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Home Address</label>
                <AddressAutocomplete
                  className="bg-white"
                  onAddressSelect={(data) => {
                    setField("homeAddress", data.address);
                    setField("homeCity", data.city ?? null);
                    setField("homeState", data.state ?? null);
                    setField("homePostalCode", data.postalCode ?? null);
                    setField("homeLat", data.lat ?? null);
                    setField("homeLng", data.lng ?? null);
                    setField("homePlaceId", data.placeId ?? null);
                    setField("homeCountry", data.country ?? null);
                  }}
                  initialValue={formatAddressLine({
                    street: homeAddress,
                    city: homeCity,
                    state: homeState,
                    postalCode: homePostalCode,
                  })}
                />
              </div>
              {/* Country Indicator Badge */}
              {isUSADriver && <CountryIndicator country="usa" />}
              {isCanadaDriver && <CountryIndicator country="canada" />}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-3">
            <h3 className="mb-2 text-sm font-semibold text-gray-800">Vehicle Information</h3>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Make</label>
                <input
                  type="text"
                  value={vehicleMake ?? ""}
                  onChange={(e) => setField("vehicleMake", e.target.value || null)}
                  className="w-full rounded border px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  placeholder="e.g., Ford"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Model</label>
                <input
                  type="text"
                  value={vehicleModel ?? ""}
                  onChange={(e) => setField("vehicleModel", e.target.value || null)}
                  className="w-full rounded border px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  placeholder="e.g., F-150"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Year</label>
                <input
                  type="number"
                  value={vehicleYear ?? ""}
                  onChange={(e) =>
                    setField("vehicleYear", e.target.value ? parseInt(e.target.value) : null)
                  }
                  className="w-full rounded border px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  placeholder="e.g., 2020"
                  min="1900"
                  max={new Date().getFullYear() + 1}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">VIN Number</label>
                <input
                  type="text"
                  value={vehicleVin ?? ""}
                  onChange={(e) => setField("vehicleVin", e.target.value || null)}
                  className="w-full rounded border px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
                  placeholder="17-digit VIN"
                  maxLength={17}
                />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-sm font-semibold text-gray-800">Document Uploads</h3>
              <p className="text-xs text-gray-500">JPG, PNG, HEIC, WebP or PDF · up to 5MB</p>
            </div>
            <div className="space-y-2">
              {DRIVER_DOCUMENTS.map((doc) =>
                doc.usaOnly && !isUSADriver ? (
                  <div
                    key={doc.type}
                    className="rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2.5"
                  >
                    <p className="text-sm font-medium text-gray-500">{doc.label} not required</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {isCanadaDriver
                        ? "Canadian drivers do not need to upload a medical card."
                        : "Only required for drivers with a USA home address."}
                    </p>
                  </div>
                ) : (
                  <DriverDocumentCard
                    key={doc.type}
                    label={doc.label}
                    hint={doc.hint}
                    bucket="driver-documents"
                    storagePath={`${driverStoragePath}/${doc.storageKey}`}
                    value={documentValues[doc.pathField]}
                    onChange={(path) => setField(doc.pathField, path)}
                    expiresOn={documentValues[doc.expiryField]}
                    onExpiresOnChange={(next) => setField(doc.expiryField, next)}
                    todayIso={todayIso}
                    disabled={zonesOnly}
                  />
                ),
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
