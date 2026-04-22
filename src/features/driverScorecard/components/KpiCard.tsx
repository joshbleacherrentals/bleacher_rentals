"use client";

import { ReactNode } from "react";

type Props = {
  label: string;
  value: string;
  icon?: ReactNode;
};

export default function KpiCard({ label, value, icon }: Props) {
  return (
    <div className="flex-1 min-w-[180px] bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</div>
        {icon ? <div className="text-darkBlue">{icon}</div> : null}
      </div>
      <div className="text-2xl font-bold text-darkBlue">{value}</div>
    </div>
  );
}
