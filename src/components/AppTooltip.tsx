"use client";

import { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type AppTooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Extra classes for the bubble, e.g. a max width so long text wraps. */
  className?: string;
};

export function AppTooltip({ content, children, side = "top", className }: AppTooltipProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} className={cn("z-[9999]", className)}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
