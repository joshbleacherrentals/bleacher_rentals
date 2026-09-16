"use client";

import LoadingSpinner from "@/components/LoadingSpinner";
import { Tables } from "../../../../database.types";
import {
  calculateFinancialTotals,
  calculateTravelTotals,
  formatDriveTime,
  formatMileage,
  formatWorkTrackerTime,
} from "../util";
import { useWorkTrackersForWeek } from "../hooks/useWorkTrackersForWeek";
import { isCanadianAddress, isUsaAddress } from "../util/addressCountry";
import WorkTrackerStatusBadge from "./WorkTrackerStatusBadge";
import { useAttentionByTracker } from "../db/withdrawnTrackers";
import { AttentionMark } from "./AttentionMark";

type Props = {
  userUuid: string;
  startDate: string;
  onSelectWorkTracker?: (workTracker: Tables<"WorkTrackers">) => void;
};

export function TripList({ userUuid, startDate, onSelectWorkTracker }: Props) {
  const { data, isLoading, error } = useWorkTrackersForWeek(userUuid, startDate);
  const attentionByTracker = useAttentionByTracker();
  let financialTotals;
  let travelTotals;
  if (data) {
    financialTotals = calculateFinancialTotals(data);
    travelTotals = calculateTravelTotals(data);
  }

  if (error) {
    return (
      <tbody className="p-4">
        <tr>
          <td>Uh Oh, Something went wrong... 😬</td>
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

  const className = "py-1 text-center text-xs font-light border-r";
  const classNameBold = "py-1 text-center text-xs font-bold border-r";
  return (
    <tbody>
      {data?.workTrackers.map((row, index) => {
        const crossBorder =
          isCanadianAddress(data.driverAddress?.country, data.driverAddress?.street) &&
          isUsaAddress(row.dropoff_address?.country, row.dropoff_address?.street);
        return (
          <tr
            key={index}
            onClick={() => onSelectWorkTracker && onSelectWorkTracker(row.workTracker)}
            className={`border-b h-12 border-gray-200 transition-all duration-100 ease-in-out cursor-pointer ${
              crossBorder ? "bg-yellow-100 hover:bg-yellow-200" : "hover:bg-gray-100"
            }`}
          >
            <th className={`w-0 whitespace-nowrap px-2 ${className}`}>
              <span className="flex items-center gap-1.5">
                <WorkTrackerStatusBadge status={row.workTracker.status} showText={false} />
                <AttentionMark reason={attentionByTracker.get(row.workTracker.id)} />
              </span>
            </th>
            <th className={`w-[7%] ${className}`}>{row.workTracker.date}</th>
            <th className={`w-[6%] ${className}`}>{row.bleacherNumber}</th>
            <th className={`w-[7%] whitespace-normal ${className}`}>{row.activityType ?? ""}</th>
            <th className={`w-[10%] ${className}`}>{row.pickup_address?.street ?? ""}</th>
            <th className={`w-[7%] ${className}`}>{row.workTracker.pickup_poc}</th>
            <th className={`w-[6%] ${className}`}>
              {formatWorkTrackerTime(
                row.workTracker.pickup_time_mode,
                row.workTracker.pickup_time_start,
                row.workTracker.pickup_time_end,
              )}
            </th>
            <th className={`w-[10%] ${className}`}>{row.dropoff_address?.street ?? ""}</th>
            <th className={`w-[7%] ${className}`}>{row.workTracker.dropoff_poc}</th>
            <th className={`w-[6%] ${className}`}>
              {formatWorkTrackerTime(
                row.workTracker.dropoff_time_mode,
                row.workTracker.dropoff_time_start,
                row.workTracker.dropoff_time_end,
              )}
            </th>
            <th className={`w-[6%] ${className}`}>
              {formatDriveTime(row.workTracker.drive_minutes)}
            </th>
            <th className={`w-[7%] ${className}`}>
              {formatMileage(row.workTracker.distance_meters)}
            </th>
            <th className={`w-[7%] ${className}`}>
              {row.workTracker.pay_cents ? `$${(row.workTracker.pay_cents / 100).toFixed(2)}` : ""}
            </th>
            <th className={`w-[14%] ${className}`}>{row.workTracker.notes}</th>
          </tr>
        );
      })}
      <tr className="border-b h-12 border-gray-200 ">
        <th className={`w-0 ${className}`}></th>
        <th className={`w-[7%] ${classNameBold}`}>SubTotal</th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[10%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[10%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}>
          {travelTotals ? formatDriveTime(travelTotals.totalDriveMinutes) : ""}
        </th>
        <th className={`w-[7%] ${className}`}>
          {travelTotals ? formatMileage(travelTotals.totalDistanceMeters) : ""}
        </th>
        <th className={`w-[7%] ${className}`}>
          {financialTotals ? `$${(financialTotals.subtotal / 100).toFixed(2)}` : ""}
        </th>
        <th className={`w-[14%] ${className}`}></th>
      </tr>
      <tr className="border-b h-12 border-gray-200 ">
        <th className={`w-0 ${className}`}></th>
        <th className={`w-[7%] ${classNameBold}`}>{`HST (${data?.driverTax}%)`}</th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[10%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[10%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}>
          {financialTotals ? `$${(financialTotals.tax / 100).toFixed(2)}` : ""}
        </th>
        <th className={`w-[14%] ${className}`}></th>
      </tr>
      <tr className="border-b h-12 border-gray-200 ">
        <th className={`w-0 ${className}`}></th>
        <th className={`w-[7%] ${classNameBold}`}>Total Amount To Be Paid</th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[10%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[10%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[6%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}></th>
        <th className={`w-[7%] ${className}`}>
          {financialTotals ? `$${(financialTotals.total / 100).toFixed(2)}` : ""}
        </th>
        <th className={`w-[14%] ${className}`}></th>
      </tr>
    </tbody>
  );
}
