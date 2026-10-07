"use client";

import { LayoutDashboard, Send, Trash2 } from "lucide-react";
import type { QuotesBookingsCapabilities } from "@/features/userAccess/logic/getQuotesBookingsCapabilities";

/**
 * The button group in the quote card's tab bar: Open in Dashboard, Edit, Delete, Send To Client.
 * Each button is drawn by its capability and by nothing else — this component does not ask who the
 * user is. A deleted quote has no actions, whatever the capabilities say.
 */
export function QuoteActionBar({
  can,
  isDeleted,
  deleting,
  onOpenInDashboard,
  onEdit,
  onDelete,
  onSendToClient,
}: {
  can: Pick<QuotesBookingsCapabilities, "openInDashboard" | "manageQuote" | "sendToClient">;
  isDeleted: boolean;
  deleting: boolean;
  onOpenInDashboard: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSendToClient: () => void;
}) {
  if (isDeleted) return null;

  return (
    <>
      {can.openInDashboard && (
        <button
          onClick={onOpenInDashboard}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
        >
          <LayoutDashboard className="w-4 h-4" />
          Open in Dashboard
        </button>
      )}
      {can.manageQuote && (
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50 transition cursor-pointer"
        >
          Edit
        </button>
      )}
      {can.manageQuote && (
        <button
          onClick={onDelete}
          disabled={deleting}
          className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-300 rounded-sm hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
      {can.sendToClient && (
        <button
          onClick={onSendToClient}
          className="px-3 py-1.5 text-sm font-semibold text-white bg-darkBlue rounded-sm hover:bg-lightBlue transition cursor-pointer flex items-center gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          Send To Client
        </button>
      )}
    </>
  );
}
