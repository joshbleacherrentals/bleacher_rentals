"use client";

import { PERMISSIONS, ROLE_LABELS, ROLE_DESCRIPTIONS } from "../../permissionPageData";
import type { WebRole } from "../../logic/determineAccess";

const COLOR_MAP: Record<WebRole, string> = {
  admin: "border-l-emerald-500",
  account_manager: "border-l-lightBlue",
  developer: "border-l-amber-500",
  viewer: "border-l-violet-500",
  driver: "border-l-blue-400",
  maintainer: "border-l-orange-500",
};

type RoleCardProps = {
  role: WebRole;
};

export function RoleCard({ role }: RoleCardProps) {
  const label = ROLE_LABELS[role];
  const desc = ROLE_DESCRIPTIONS[role];
  return (
    <button type="button" className={`text-left transition-shadow rounded-lg`}>
      <div
        className={`rounded-lg border border-gray-200 border-l-4 ${COLOR_MAP[role]} bg-white p-4 h-full`}
      >
        <h3 className="text-sm font-semibold text-darkBlue">{label}</h3>
        <p className="mt-1 max-h-[50px] overflow-y-auto text-xs text-gray-500">{desc}</p>
      </div>
    </button>
  );
}
