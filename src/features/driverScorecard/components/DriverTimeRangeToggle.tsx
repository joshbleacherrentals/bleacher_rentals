"use client";

import { RotateCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TimeRange } from "../types";

const RANGES: TimeRange[] = ["weekly", "quarterly", "annually"];

const RANGE_LABELS: Record<TimeRange, string> = {
  weekly: "Weekly",
  quarterly: "Quarterly",
  annually: "Year to Date",
};

export default function DriverTimeRangeToggle() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeRange = (searchParams.get("timeRange") as TimeRange) ?? "weekly";
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!searchParams.get("timeRange")) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("timeRange", "weekly");
      router.replace(`?${params.toString()}`);
    }
  }, [searchParams, router]);

  return (
    <button
      onClick={() => {
        const currentIndex = RANGES.indexOf(activeRange);
        const nextIndex = (currentIndex + 1) % RANGES.length;
        const nextRange = RANGES[nextIndex];
        const params = new URLSearchParams(searchParams.toString());
        params.set("timeRange", nextRange);
        router.replace(`?${params.toString()}`);
        setIsAnimating(true);
        window.setTimeout(() => setIsAnimating(false), 220);
      }}
      className="group text-3xl text-darkBlue font-bold border border-gray-300 rounded-lg p-2 flex items-center gap-2 bg-white hover:bg-gray-50 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-pointer"
    >
      <span
        className={`transition-all duration-200 ${
          isAnimating ? "opacity-60 translate-y-0.5" : "opacity-100 translate-y-0"
        }`}
      >
        {RANGE_LABELS[activeRange]}
      </span>
      <RotateCw className="w-5 h-5 transition-transform duration-200 group-hover:rotate-180" />
    </button>
  );
}
