"use client";

import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { placeMapEmbedUrl } from "@/components/maps/placeMapEmbedUrl";

type DeviceLocation = {
  deviceId: string;
  name: string;
  imei: string | null;
  uuid: string | null;
  vin: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  updatedAt: string | null;
};

type BleacherLocationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  bleacherNumber: number;
  deviceId: string;
};

const getStatusStyles = (status: string | null) => {
  if (!status) return "bg-gray-100 text-gray-700 border-gray-300";

  const statusLower = status.toLowerCase();
  if (statusLower === "moving") {
    return "bg-green-50 text-green-700 border-green-300";
  }
  if (statusLower === "stopped") {
    return "bg-amber-50 text-amber-700 border-amber-300";
  }
  if (statusLower === "idle") {
    return "bg-blue-50 text-blue-700 border-blue-300";
  }
  return "bg-gray-50 text-gray-700 border-gray-300";
};

export default function BleacherLocationModal({
  isOpen,
  onClose,
  bleacherNumber,
  deviceId,
}: BleacherLocationModalProps) {
  const {
    data: device,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["linxup-device-location", deviceId],
    queryFn: async () => {
      const res = await fetch(`/api/linxup/devices/${deviceId}`);
      if (!res.ok) {
        throw new Error("Failed to fetch device location");
      }
      return res.json() as Promise<DeviceLocation>;
    },
    enabled: isOpen && !!deviceId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bleacher #{bleacherNumber} - Live Location</DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="text-center py-8 text-gray-600">Loading device location...</div>
        )}

        {error && (
          <div className="text-center py-8 text-red-600">
            Failed to load device location. Please try again.
          </div>
        )}

        {device && (
          <div className="space-y-4">
            {/* Device Name & Status */}
            <div className="flex items-center justify-between gap-4 pb-3 border-b">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{device.name}</h3>
                {device.vin && (
                  <p className="text-sm text-gray-600 font-mono mt-0.5">{device.vin}</p>
                )}
              </div>
              {device.status && (
                <div
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border ${getStatusStyles(
                    device.status,
                  )}`}
                >
                  {device.status}
                </div>
              )}
            </div>

            {/* Map */}
            {device.lat && device.lng ? (
              <div className="w-full h-[400px] rounded-lg overflow-hidden border border-gray-300">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: 0 }}
                  referrerPolicy="no-referrer-when-downgrade"
                  src={placeMapEmbedUrl(device.lat, device.lng)}
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="w-full h-[400px] rounded-lg border border-gray-300 flex items-center justify-center bg-gray-50">
                <p className="text-gray-500">Location data unavailable</p>
              </div>
            )}

            {/* Device Stats Grid */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-500 uppercase font-medium mb-1">Latitude</div>
                <div className="text-base font-semibold text-gray-900 font-mono">
                  {device.lat?.toFixed(6) ?? "N/A"}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-500 uppercase font-medium mb-1">Longitude</div>
                <div className="text-base font-semibold text-gray-900 font-mono">
                  {device.lng?.toFixed(6) ?? "N/A"}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-500 uppercase font-medium mb-1">Speed</div>
                <div className="text-base font-semibold text-gray-900">
                  {device.speed != null ? `${device.speed} km/h` : "N/A"}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <div className="text-xs text-gray-500 uppercase font-medium mb-1">Device ID</div>
                <div className="text-base font-semibold text-gray-900 font-mono truncate">
                  {device.deviceId}
                </div>
              </div>

              {device.imei && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase font-medium mb-1">IMEI</div>
                  <div className="text-base font-semibold text-gray-900 font-mono truncate">
                    {device.imei}
                  </div>
                </div>
              )}

              {device.uuid && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs text-gray-500 uppercase font-medium mb-1">UUID</div>
                  <div className="text-xs font-semibold text-gray-900 font-mono truncate">
                    {device.uuid}
                  </div>
                </div>
              )}

              {device.updatedAt && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 col-span-2">
                  <div className="text-xs text-gray-500 uppercase font-medium mb-1">
                    Last Updated
                  </div>
                  <div className="text-base font-semibold text-gray-900">
                    {new Date(parseInt(device.updatedAt)).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
