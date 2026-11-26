"use client";

import { useState } from "react";
import { CurrentWeeksList } from "@/features/workTrackers/components/CurrentWeeksList";
import { YearlyWeeksList } from "@/features/workTrackers/components/YearlyWeeksList";
import { WeeksNav } from "@/features/workTrackers/components/WeeksNav";

export default function WorkTrackersPage() {
  const [selectedView, setSelectedView] = useState<"current" | number>("current");

  return (
    <div>
      <WeeksNav selectedView={selectedView} onViewChange={setSelectedView} />

      <table className="min-w-full border-collapse border border-gray-200">
        {/* Header */}
        <thead className="bg-gray-100">
          <tr className="border-b border-gray-200">
            <th className="p-3 text-left font-semibold">
              {selectedView === "current" ? "Week" : `${selectedView} Weeks`}
            </th>
          </tr>
        </thead>

        {selectedView === "current" ? (
          <CurrentWeeksList />
        ) : (
          <YearlyWeeksList year={selectedView} />
        )}
      </table>
    </div>
  );
}
