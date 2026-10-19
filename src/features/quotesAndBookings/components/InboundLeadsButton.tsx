"use client";

import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * One click to the work list for website quotes: not sent yet, oldest first. It sets the same
 * filters the Filter Panel does, so the panel and the filter chips follow. Dark when the list
 * already shows exactly that.
 */
export function InboundLeadsButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer gap-1.5 text-white shadow-md transition ${
        active
          ? "bg-gradient-to-r from-gray-700 to-gray-900"
          : "bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-500 hover:to-blue-600"
      }`}
    >
      <Inbox className="h-4 w-4" />
      Inbound Leads
    </Button>
  );
}
