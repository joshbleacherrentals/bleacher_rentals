"use client";

import LoadingSpinner from "@/components/LoadingSpinner";
import { useRouter } from "next/navigation";
import { useWorkTrackerAccess, useDriversForWeek } from "../hooks/useDriversForWeek";
import { useUser } from "@clerk/nextjs";
import { useUsersStore } from "@/state/userStore";
import { useState } from "react";
import { PaymentStatusButton } from "./PaymentStatusButton";
import { TotalsMatch } from "./TotalsMatch";
import { DateTime } from "luxon";
import { useWithdrawnCountsByDriver } from "../db/withdrawnTrackers";
import { WithdrawnBadgeSlot } from "./WithdrawnBadgeSlot";
import {
  PAY_CURRENCIES,
  parsePayCurrencyFilter,
  type PayCurrencyFilter,
} from "../util/payCurrencyFilter";

type Props = {
  startDate: string;
};

function RegionFlag({ region }: { region: "US" | "CAN" | null }) {
  if (!region) return null;
  return (
    <span className="text-base leading-none" title={region === "US" ? "United States" : "Canada"}>
      {region === "US" ? "🇺🇸" : "🇨🇦"}
    </span>
  );
}

function formatPay(cents: number, payCurrency: string): string {
  const amount = (cents / 100).toFixed(2);
  const symbol = "$";
  return `${symbol}${amount} ${payCurrency}`;
}

function formatUnitTotal(
  payPerUnit: string,
  totalDistanceMeters: number,
  totalDriveMinutes: number,
): string | null {
  if (payPerUnit === "HR") {
    if (totalDriveMinutes === 0) return null;
    const hours = totalDriveMinutes / 60;
    return `${hours.toFixed(1)} hrs`;
  }
  if (payPerUnit === "MI") {
    if (totalDistanceMeters === 0) return null;
    const miles = totalDistanceMeters / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }
  // Default: KM
  if (totalDistanceMeters === 0) return null;
  const km = totalDistanceMeters / 1000;
  return `${km.toFixed(1)} km`;
}

export function DriverListForWeek({ startDate }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const users = useUsersStore((s) => s.users);
  const [showAllDrivers, setShowAllDrivers] = useState(false);
  const [payCurrencyFilter, setPayCurrencyFilter] = useState<PayCurrencyFilter>("ALL");

  // Calculate week end date (6 days after start)
  const weekEnd = DateTime.fromISO(startDate).plus({ days: 6 }).toISODate() || startDate;

  const getCurrentUserUuid = () => {
    const clerkId = user?.id;
    if (clerkId) {
      const match = users.find((u) => u.clerk_user_id === clerkId);
      if (match) return match.id;
    }
    return null;
  };

  const currentUserUuid = getCurrentUserUuid();

  const { access: accessData, isLoading: accessLoading } = useWorkTrackerAccess(currentUserUuid);

  // Always scoped to my own zones, even while "See All Drivers" is on: the
  // badge answers "what do I have to re-cover", which does not widen just
  // because the list does.
  const withdrawnByDriver = useWithdrawnCountsByDriver(startDate);

  const hasAccess = !!accessData && (accessData.isAdmin || accessData.isAccountManager);

  const { drivers, isLoading } = useDriversForWeek(
    startDate,
    showAllDrivers,
    accessData ?? null,
    hasAccess,
    payCurrencyFilter,
  );

  if (accessLoading) {
    return (
      <tbody className="p-4">
        <tr>
          <td>
            <LoadingSpinner />
          </td>
        </tr>
      </tbody>
    );
  }

  if (!accessData || (!accessData.isAdmin && !accessData.isAccountManager)) {
    return (
      <tbody className="p-4">
        <tr>
          <td className="text-center py-8">
            <div className="text-red-600 font-semibold mb-2">Access Denied</div>
            <div className="text-gray-600 text-sm">
              You must be an Account Manager or Admin to access this page.
            </div>
          </td>
        </tr>
      </tbody>
    );
  }

  if (isLoading) {
    return (
      <tbody className="p-4">
        <tr>
          <td>
            <LoadingSpinner />
          </td>
        </tr>
      </tbody>
    );
  }

  return (
    <>
      <tbody>
        <tr>
          <td className="p-3">
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setShowAllDrivers(!showAllDrivers)}
                className="px-4 py-2 bg-darkBlue text-white text-sm font-semibold rounded shadow-md hover:bg-lightBlue transition cursor-pointer"
              >
                {showAllDrivers ? "See My Drivers Only" : "See All Drivers"}
              </button>

              <div className="flex items-center gap-2">
                <label htmlFor="pay-currency-filter" className="text-sm font-medium text-gray-600">
                  Currency:
                </label>
                <select
                  id="pay-currency-filter"
                  value={payCurrencyFilter}
                  onChange={(e) => setPayCurrencyFilter(parsePayCurrencyFilter(e.target.value))}
                  className="px-3 py-1.5 border rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-darkBlue focus:border-0"
                >
                  <option value="ALL">All Currencies</option>
                  {PAY_CURRENCIES.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
      <tbody>
        {drivers.map((row, index) => (
          <tr
            key={index}
            className={`border-b h-12 border-gray-200 transition-all duration-100 ease-in-out cursor-pointer ${
              row.hasCrossBorderTrips ? "bg-yellow-100 hover:bg-yellow-200" : "hover:bg-gray-100"
            }`}
            onClick={() => router.push(`/work-trackers/${startDate}/${row.id.toString()}`)}
          >
            <td className="py-1 px-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <WithdrawnBadgeSlot
                    count={withdrawnByDriver.get(row.driver_uuid) ?? 0}
                    label={`${withdrawnByDriver.get(row.driver_uuid) ?? 0} work trackers declined or abandoned by this driver this week`}
                  />
                  <span className="flex items-center gap-1.5 truncate">
                    {row.first_name + " " + row.last_name}
                    <RegionFlag region={row.region} />
                  </span>
                  <span className="flex items-center gap-2 text-sm text-gray-500 flex-shrink-0">
                    {row.totalPayCents > 0 && (
                      <span className="text-green-600 font-medium">
                        {formatPay(row.totalPayCents, row.payCurrency)}
                      </span>
                    )}
                    {row.tripCount} {row.tripCount === 1 ? "trip" : "trips"}
                    {(() => {
                      const unitTotal = formatUnitTotal(
                        row.payPerUnit,
                        row.totalDistanceMeters,
                        row.totalDriveMinutes,
                      );
                      return unitTotal ? <span>· {unitTotal}</span> : null;
                    })()}
                  </span>
                </div>
                <div
                  className="flex-shrink-0 flex items-center gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TotalsMatch driver={row} />
                  <PaymentStatusButton driver={row} weekStart={startDate} weekEnd={weekEnd} />
                </div>
              </div>
            </td>
          </tr>
        ))}
        {drivers.length === 0 && (
          <tr>
            <td className="py-4 px-3 text-center text-gray-500">
              {payCurrencyFilter !== "ALL"
                ? `No ${payCurrencyFilter} drivers found.`
                : showAllDrivers
                  ? "No drivers found in the system."
                  : "No drivers are assigned to your zones."}
            </td>
          </tr>
        )}
      </tbody>
    </>
  );
}
