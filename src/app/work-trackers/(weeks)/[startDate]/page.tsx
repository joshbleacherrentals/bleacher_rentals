"use client";
import { DriverListForWeek } from "@/features/workTrackers/components/DriverListForWeek";
import { useParams } from "next/navigation";

export default function WorkTrackersForWeekPage() {
  const params = useParams();
  const startDate = params.startDate as string;

  return (
    <table className="min-w-full border-collapse border border-gray-200">
      {/* Header */}
      <thead className="bg-gray-100">
        <tr className="border-b border-gray-200">
          <th className="p-3 text-left font-semibold">Driver</th>
        </tr>
      </thead>

      <DriverListForWeek startDate={startDate} />
    </table>
  );
}
