"use client";

import { DriverMileageData, DriverMileageRow } from "../types";
import { formatDistance, formatDriveTime } from "../util";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

type Props = {
  currentData: DriverMileageData;
  previousData: DriverMileageData | null;
  periodLabel: string;
};

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0 && current === 0) {
    return <span className="text-gray-400 text-sm">—</span>;
  }
  if (previous === 0) {
    return (
      <span className="text-green-600 text-sm flex items-center gap-0.5">
        <TrendingUp className="w-3.5 h-3.5" />
        New
      </span>
    );
  }

  const pctChange = ((current - previous) / previous) * 100;

  if (Math.abs(pctChange) < 1) {
    return (
      <span className="text-gray-400 text-sm flex items-center gap-0.5">
        <Minus className="w-3.5 h-3.5" />
        0%
      </span>
    );
  }

  if (pctChange > 0) {
    return (
      <span className="text-green-600 text-sm flex items-center gap-0.5">
        <TrendingUp className="w-3.5 h-3.5" />+{pctChange.toFixed(0)}%
      </span>
    );
  }

  return (
    <span className="text-red-500 text-sm flex items-center gap-0.5">
      <TrendingDown className="w-3.5 h-3.5" />
      {pctChange.toFixed(0)}%
    </span>
  );
}

function DistanceBar({ meters, maxMeters }: { meters: number; maxMeters: number }) {
  const pct = maxMeters > 0 ? (meters / maxMeters) * 100 : 0;
  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5">
      <div
        className="bg-darkBlue h-2.5 rounded-full transition-all duration-500"
        style={{ width: `${Math.max(pct, 1)}%` }}
      />
    </div>
  );
}

export default function DriverMileageTable({ currentData, previousData, periodLabel }: Props) {
  const maxDistance =
    currentData.drivers.length > 0
      ? Math.max(...currentData.drivers.map((d) => d.totalDistanceMeters))
      : 0;

  const previousByDriver = new Map<string, DriverMileageRow>();
  if (previousData) {
    previousData.drivers.forEach((d) => previousByDriver.set(d.driverUuid, d));
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <table className="min-w-full">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              #
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Driver
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Distance
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[200px]">
              {/* Bar */}
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Drive Time
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Trips
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              vs Last {periodLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {currentData.drivers.map((driver, index) => {
            const prev = previousByDriver.get(driver.driverUuid);
            const name =
              [driver.firstName, driver.lastName].filter(Boolean).join(" ") || "Unknown Driver";

            return (
              <tr
                key={driver.driverUuid}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="px-5 py-4 text-sm text-gray-400 font-medium">{index + 1}</td>
                <td className="px-5 py-4">
                  <div className="font-semibold text-darkBlue">{name}</div>
                  <div className="text-xs text-gray-400">
                    Paid per {driver.payPerUnit.toLowerCase()}
                  </div>
                </td>
                <td className="px-5 py-4 font-semibold text-darkBlue whitespace-nowrap">
                  {formatDistance(driver.totalDistanceMeters, driver.payPerUnit)}
                </td>
                <td className="px-5 py-4">
                  <DistanceBar meters={driver.totalDistanceMeters} maxMeters={maxDistance} />
                </td>
                <td className="px-5 py-4 text-sm text-gray-600 whitespace-nowrap">
                  {driver.totalDriveMinutes > 0 ? formatDriveTime(driver.totalDriveMinutes) : "—"}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{driver.tripCount}</td>
                <td className="px-5 py-4">
                  <ChangeIndicator
                    current={driver.totalDistanceMeters}
                    previous={prev?.totalDistanceMeters ?? 0}
                  />
                </td>
              </tr>
            );
          })}
          {currentData.drivers.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                No driver data for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
