"use client";

import { DriverMileageData } from "../types";
import { formatDriveTime } from "../util";
import { MapPin, Clock, Truck } from "lucide-react";

type Props = {
  data: DriverMileageData;
  periodLabel: string;
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4">
      <div className="p-3 bg-blue-50 rounded-lg text-darkBlue">{icon}</div>
      <div>
        <div className="text-sm text-gray-500 font-medium">{label}</div>
        <div className="text-2xl font-bold text-darkBlue">{value}</div>
      </div>
    </div>
  );
}

export default function FleetOverview({ data, periodLabel }: Props) {
  const totalKm = (data.fleetTotalDistanceMeters / 1000).toFixed(0);
  const totalMi = (data.fleetTotalDistanceMeters / 1609.344).toFixed(0);
  const activeDrivers = data.drivers.filter((d) => d.tripCount > 0).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <StatCard
        icon={<MapPin className="w-5 h-5" />}
        label={`Fleet Distance (This ${periodLabel})`}
        value={`${Number(totalKm).toLocaleString()} km`}
      />
      <StatCard
        icon={<MapPin className="w-5 h-5" />}
        label={`Fleet Distance (This ${periodLabel})`}
        value={`${Number(totalMi).toLocaleString()} mi`}
      />
      <StatCard
        icon={<Clock className="w-5 h-5" />}
        label={`Total Drive Time`}
        value={formatDriveTime(data.fleetTotalDriveMinutes)}
      />
      <StatCard
        icon={<Truck className="w-5 h-5" />}
        label="Active Drivers / Trips"
        value={`${activeDrivers} drivers · ${data.fleetTotalTrips} trips`}
      />
    </div>
  );
}
