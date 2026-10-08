"use client";

import { motion } from "framer-motion";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  nextStatusPreset,
  presetOfStatuses,
  statusesForPreset,
  type StatusQuickState,
} from "../utils/statusQuickFilter";

const CONFIG: Record<
  StatusQuickState,
  { label: string; bgColor: string; hoverColor: string; shadowColor: string }
> = {
  all: {
    label: "All Statuses",
    bgColor: "bg-gradient-to-r from-gray-400 to-slate-500",
    hoverColor: "hover:from-gray-500 hover:to-slate-600",
    shadowColor: "shadow-gray-300/50",
  },
  booked: {
    label: "Booked",
    bgColor: "bg-gradient-to-r from-emerald-400 to-green-500",
    hoverColor: "hover:from-emerald-500 hover:to-green-600",
    shadowColor: "shadow-emerald-300/50",
  },
  quoted: {
    label: "Quoted",
    bgColor: "bg-gradient-to-r from-amber-400 to-yellow-500",
    hoverColor: "hover:from-amber-500 hover:to-yellow-600",
    shadowColor: "shadow-amber-300/50",
  },
  lost: {
    label: "Lost",
    bgColor: "bg-gradient-to-r from-rose-400 to-red-500",
    hoverColor: "hover:from-rose-500 hover:to-red-600",
    shadowColor: "shadow-rose-300/50",
  },
  draft: {
    label: "Draft",
    bgColor: "bg-gradient-to-r from-violet-400 to-purple-500",
    hoverColor: "hover:from-violet-500 hover:to-purple-600",
    shadowColor: "shadow-violet-300/50",
  },
  // The Filter Panel holds a mix the button does not cycle through.
  custom: {
    label: "Custom Statuses",
    bgColor: "bg-gradient-to-r from-sky-400 to-blue-500",
    hoverColor: "hover:from-sky-500 hover:to-blue-600",
    shadowColor: "shadow-sky-300/50",
  },
};

/**
 * One-click status filter for the Quotes & Bookings list, in the style of the dashboard's rows
 * button: each click steps All Statuses -> Booked -> Quoted -> Lost -> Draft -> All Statuses. It sets the
 * same `statuses` filter the Filter Panel does, so the panel and the active-filter chips follow.
 */
export function StatusQuickToggle({
  statuses,
  onStatusesChange,
}: {
  statuses: string[];
  onStatusesChange: (statuses: string[]) => void;
}) {
  const current = presetOfStatuses(statuses);
  const config = CONFIG[current];

  return (
    <motion.div
      key={`status-${current}`}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <Button
        onClick={() => onStatusesChange(statusesForPreset(nextStatusPreset(current)))}
        className={`
          ${config.bgColor}
          ${config.hoverColor}
          text-white
          ${config.shadowColor}
          shadow-lg
          font-semibold
          px-4 py-2
          transition-all duration-300
          flex items-center gap-2
        `}
      >
        <ListFilter className="w-4 h-4" />
        <span>{config.label}</span>
      </Button>
    </motion.div>
  );
}
