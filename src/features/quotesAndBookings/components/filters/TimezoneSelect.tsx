"use client";

import { useTimezoneStore, TIMEZONE_OPTIONS } from "@/lib/useTimezoneStore";

export function TimezoneSelect() {
  const { timezone, setTimezone } = useTimezoneStore();

  return (
    <select
      value={timezone}
      onChange={(e) => setTimezone(e.target.value)}
      className="w-full h-8 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue bg-white"
    >
      {TIMEZONE_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
