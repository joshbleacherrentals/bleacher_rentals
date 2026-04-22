"use client";

import { DriverDistanceRow } from "../types";

type Props = {
  rows: DriverDistanceRow[];
};

function formatKm(meters: number): string {
  return `${(meters / 1000).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

function formatDriveTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatPay(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const BONUS_THRESHOLD_KM = 20_000;
const BONUS_DOLLARS_PER_KM = 0.02;

/**
 * Year-end bonus: $0.02 per km, only earned after driving 20,000 km.
 * Returns either the qualified bonus amount or how many more km are needed.
 */
function calculateBonus(meters: number): { qualified: boolean; label: string } {
  const km = meters / 1000;
  if (km >= BONUS_THRESHOLD_KM) {
    const bonus = km * BONUS_DOLLARS_PER_KM;
    return {
      qualified: true,
      label: `$${bonus.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
    };
  }
  const remainingKm = BONUS_THRESHOLD_KM - km;
  return {
    qualified: false,
    label: `${remainingKm.toLocaleString(undefined, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} km to qualify`,
  };
}

export default function DriverMileageTable({ rows }: Props) {
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
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Drive Time
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Trips
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Pay
            </th>
            <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Bonus
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const name =
              [row.firstName, row.lastName].filter(Boolean).join(" ") || "Unknown Driver";
            const bonus = calculateBonus(row.distanceMeters);

            return (
              <tr
                key={row.driverUuid}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                <td className="px-5 py-4 text-sm text-gray-400 font-medium">{index + 1}</td>
                <td className="px-5 py-4 font-semibold text-darkBlue">{name}</td>
                <td className="px-5 py-4 font-semibold text-darkBlue whitespace-nowrap">
                  {formatKm(row.distanceMeters)}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600 whitespace-nowrap">
                  {row.driveMinutes > 0 ? formatDriveTime(row.driveMinutes) : "—"}
                </td>
                <td className="px-5 py-4 text-sm text-gray-600">{row.tripCount}</td>
                <td className="px-5 py-4 text-sm text-gray-600 whitespace-nowrap">
                  {formatPay(row.payCents)}
                </td>
                <td
                  className={`px-5 py-4 text-sm whitespace-nowrap font-semibold ${
                    bonus.qualified ? "text-green-600" : "text-gray-400"
                  }`}
                >
                  {bonus.label}
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-5 py-12 text-center text-gray-400">
                No driver data for this year.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
