"use client";

import { usePathname } from "next/navigation";
import { useInternalChatCapabilities } from "@/features/eventChat/hooks/useInternalChatCapabilities";
import { InternalMessagesSidebar } from "@/features/eventChat/components/InternalMessagesSidebar";

export default function InternalMessagesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { useInternalChat: canUseInternalChat } = useInternalChatCapabilities();

  const selectedEventUuid = pathname.match(/^\/messages\/internal\/([^/]+)/)?.[1] ?? null;

  if (!canUseInternalChat) {
    return (
      <p className="text-sm text-gray-500 py-8 text-center">
        Internal chat is available to admins, account managers and accountants only.
      </p>
    );
  }

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] border border-gray-200 rounded-lg overflow-hidden bg-white">
      <InternalMessagesSidebar selectedEventUuid={selectedEventUuid} />
      <div className="flex-1 min-w-0 flex flex-col min-h-0">{children}</div>
    </div>
  );
}
