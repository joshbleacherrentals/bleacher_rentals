"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CodeXml, Sparkles, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHasUnreadChangelog } from "../hooks/useHasUnreadChangelog";
import pkg from "../../../../package.json";

/**
 * Header entry point for everything product/development facing.
 *
 * Replaces the old bare "Request a Feature" button. The trigger's destination
 * never changes — unread state only adds a dot, so muscle memory holds.
 */
export function ProductDropDown() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hasUnread = useHasUnreadChangelog();

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1 rounded py-1 ml-2 text-sm text-white/70 hover:text-white hover:underline cursor-pointer transition-all duration-300"
          aria-label={hasUnread ? "Product — new releases" : "Product"}
        >
          {/* <CodeXml size={20} /> */}
          {`App Version ${pkg.version}`}
          {hasUnread && (
            <span
              data-testid="product-unread-indicator"
              className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
            >
              New
            </span>
          )}
          <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : ""} />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="p-0 w-72 shadow-lg">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <p className="text-sm font-semibold text-gray-900">Product</p>
          <p className="mt-0.5 text-xs text-gray-500">
            See what we&apos;ve shipped and tell us what to build next.
          </p>
        </div>

        <div className="py-1">
          <button
            onClick={() => go("/changelog")}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            <Sparkles size={16} className="shrink-0 text-gray-400" />
            <span className="flex-1">What&apos;s New</span>
            {hasUnread && (
              <span
                data-testid="product-menu-unread-indicator"
                className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold leading-none text-white"
              >
                New
              </span>
            )}
          </button>

          <button
            onClick={() => go("/roadmap/backlog")}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            <CodeXml size={16} className="shrink-0 text-gray-400" />
            <span className="flex-1">Request a Feature</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
