"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Color } from "@/types/Color";

type Crumb = { label: string; href?: string };

export function RoadmapHeader({
  crumbs,
  description,
  rightSlot,
}: {
  crumbs: Crumb[];
  description?: string;
  rightSlot?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start mb-6 gap-4">
      <div>
        <nav className="flex items-center text-sm text-gray-500 mb-1">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center">
              {c.href ? (
                <Link href={c.href} className="hover:text-darkBlue">
                  {c.label}
                </Link>
              ) : (
                <span className="text-gray-900">{c.label}</span>
              )}
              {i < crumbs.length - 1 && <ChevronRight className="size-3 mx-1" />}
            </span>
          ))}
        </nav>
        <h1 className="text-2xl font-bold" style={{ color: Color.DARK_BLUE }}>
          {crumbs[crumbs.length - 1]?.label ?? "Roadmap"}
        </h1>
        {description && (
          <p className="text-sm mt-1" style={{ color: Color.GRAY }}>
            {description}
          </p>
        )}
      </div>
      {rightSlot && <div className="flex items-center gap-2">{rightSlot}</div>}
    </div>
  );
}
