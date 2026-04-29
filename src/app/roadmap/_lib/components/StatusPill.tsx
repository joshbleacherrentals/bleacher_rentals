"use client";

import { cn } from "@/lib/utils";

export function StatusPill({
  label,
  hex,
  className,
}: {
  label: string;
  hex: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-gray-800",
        className
      )}
      style={{ backgroundColor: hex }}
    >
      {label}
    </span>
  );
}
