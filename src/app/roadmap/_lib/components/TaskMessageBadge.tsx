"use client";

import { MessageSquare } from "lucide-react";
import { useMessagesForTask } from "../hooks/useMessages";
import { useReadReceiptsForTask } from "../hooks/useReadReceipts";

type Props = {
  taskId: string;
  userUuid: string | null;
};

export function TaskMessageBadge({ taskId, userUuid }: Props) {
  const { messages } = useMessagesForTask(taskId);
  const { receiptsByMessage } = useReadReceiptsForTask(taskId);

  const total = messages.length;
  const unread = messages.filter(
    (m) => !receiptsByMessage.get(m.id)?.includes(userUuid ?? ""),
  ).length;

  return (
    <div className="relative inline-flex items-center justify-center">
      <MessageSquare className={`size-4 ${total === 0 ? "text-gray-300" : "text-gray-400"}`} />
      {total > 0 && (
        <span
          className={`absolute -top-1.5 -right-2 min-w-[16px] h-4 rounded-full text-[9px] font-bold flex items-center justify-center px-0.5 leading-none ${
            unread > 0 ? "bg-red-500 text-white" : "bg-gray-200 text-gray-600"
          }`}
        >
          {unread > 0 ? unread : total}
        </span>
      )}
    </div>
  );
}
