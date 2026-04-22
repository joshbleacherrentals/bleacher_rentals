"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Truck, Clock, DollarSign, Route, Wrench } from "lucide-react";
import { useAvailableYears, useDriverDistanceForYear } from "../hooks/useDriverDistance";
import { useScorecardStat } from "../hooks/useScorecardStat";
import { DRIVER_SCORECARD_STAT_KEYS } from "../constants";
import DriverMileageTable from "./DriverMileageTable";
import KpiCard from "./KpiCard";

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

function formatMoney(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DriverScorecardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentYear = new Date().getFullYear();
  const yearParam = searchParams.get("year");
  const selectedYear = yearParam ? parseInt(yearParam, 10) : currentYear;

  const availableYears = useAvailableYears();
  const rows = useDriverDistanceForYear(selectedYear);
  const maintenanceCostCents = useScorecardStat(
    selectedYear,
    DRIVER_SCORECARD_STAT_KEYS.MAINTENANCE_COST_PER_YEAR,
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => {
          acc.distanceMeters += r.distanceMeters;
          acc.driveMinutes += r.driveMinutes;
          acc.payCents += r.payCents;
          acc.tripCount += r.tripCount;
          return acc;
        },
        { distanceMeters: 0, driveMinutes: 0, payCents: 0, tripCount: 0 },
      ),
    [rows],
  );

  // Make sure the current year is selectable even if it has no data yet
  const yearOptions = useMemo(() => {
    const set = new Set<number>(availableYears);
    set.add(currentYear);
    set.add(selectedYear);
    return Array.from(set)
      .sort((a, b) => b - a)
      .map((y) => ({ label: y.toString(), value: y }));
  }, [availableYears, currentYear, selectedYear]);

  // Default the URL param to the current year on first load
  useEffect(() => {
    if (!yearParam) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("year", currentYear.toString());
      router.replace(`?${params.toString()}`);
    }
  }, [yearParam, currentYear, router, searchParams]);

  const handleYearChange = (year: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", year.toString());
    router.replace(`?${params.toString()}`);
  };

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="p-4">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-5xl text-darkBlue font-bold">Driver Scorecard</div>
          <div className="text-2xl text-gray-500 font-medium">Mileage by Year</div>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            className="group text-3xl text-darkBlue font-bold border border-gray-300 rounded-lg p-2 flex items-center gap-2 bg-white hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
          >
            <span>{selectedYear}</span>
            <ChevronDown
              className={`w-5 h-5 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : "group-hover:translate-y-0.5"}`}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-1 min-w-full bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
              {yearOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    handleYearChange(opt.value);
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-lg font-semibold transition-colors cursor-pointer ${
                    opt.value === selectedYear
                      ? "bg-darkBlue text-white"
                      : "text-darkBlue hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 mb-6">
        <KpiCard
          label="Total Distance"
          value={formatKm(totals.distanceMeters)}
          icon={<Route className="w-5 h-5" />}
        />
        <KpiCard
          label="Total Drive Time"
          value={formatDriveTime(totals.driveMinutes)}
          icon={<Clock className="w-5 h-5" />}
        />
        <KpiCard
          label="Total Pay"
          value={formatMoney(totals.payCents)}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <KpiCard
          label="Total Trips"
          value={totals.tripCount.toLocaleString()}
          icon={<Truck className="w-5 h-5" />}
        />
        <KpiCard
          label="Maintenance Cost"
          value={formatMoney(maintenanceCostCents)}
          icon={<Wrench className="w-5 h-5" />}
        />
      </div>

      <DriverMileageTable rows={rows} />
    </div>
  );
}
