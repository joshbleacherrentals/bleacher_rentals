"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AddressAutocomplete, { formatAddressLine } from "@/components/AddressAutoComplete";
import { placeMapEmbedUrl } from "@/components/maps/placeMapEmbedUrl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { saveDriverAddress, type PickedAddress } from "../db/saveDriverAddress";
import type { DriverData } from "../utils/driverData";

function PinMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <iframe
      className="h-[320px] w-full rounded-md border border-gray-300"
      style={{ border: 0 }}
      referrerPolicy="no-referrer-when-downgrade"
      src={placeMapEmbedUrl(lat, lng)}
      title="Address on the map"
    />
  );
}

/**
 * Fixes a driver's home address from Driver Data: the address on file opens already searched, so
 * picking the right suggestion and pressing Save fills every part, coordinates included. The map
 * shows the pin: the one on file, then the one picked.
 */
export function DriverAddressModal({
  driver,
  onClose,
}: {
  driver: DriverData | null;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<PickedAddress | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => setPicked(null), [driver?.driverUuid]);

  const stored = driver?.address ?? null;
  const storedLine = stored
    ? formatAddressLine({
        street: stored.street,
        city: stored.city,
        state: stored.state_province,
        postalCode: stored.zip_postal,
      })
    : "";
  const pin =
    picked?.lat != null && picked.lng != null
      ? { lat: picked.lat, lng: picked.lng }
      : stored?.latitude != null && stored.longitude != null
        ? { lat: stored.latitude, lng: stored.longitude }
        : null;
  const problem = driver?.results.address?.problem ?? null;

  const handleSave = async () => {
    if (!driver || !picked) return;
    setSaving(true);
    try {
      await saveDriverAddress(driver.driverUuid, driver.addressUuid, picked);
      onClose();
    } catch (e) {
      createErrorToastNoThrow(["Could not save the address.", e instanceof Error ? e.message : ""]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!driver} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl" data-testid="driver-address-modal">
        <DialogHeader>
          <DialogTitle>{driver?.driverName}: home address</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <div className="text-gray-500">On file</div>
            <div className="font-medium">{storedLine || "No address"}</div>
            {problem && <div className="text-red-700">{problem}</div>}
          </div>

          <div>
            <div className="mb-1 text-gray-500">
              Pick the address from the list to fill in every part
            </div>
            {driver && (
              <AddressAutocomplete
                key={driver.driverUuid}
                initialSearchQuery={storedLine || undefined}
                onAddressSelect={(data) => setPicked(data)}
              />
            )}
          </div>

          {pin ? (
            <PinMap lat={pin.lat} lng={pin.lng} />
          ) : (
            <div className="flex h-[320px] items-center justify-center rounded-md border border-gray-300 bg-gray-50 text-gray-500">
              No location yet. Pick an address to see it on the map.
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!picked || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save address
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
