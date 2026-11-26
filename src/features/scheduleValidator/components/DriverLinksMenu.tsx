"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarRange, EllipsisVertical, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useZoneWeekParams } from "@/features/autoWorkTrackers/hooks/useZoneWeekParams";
import { AREAS, locatePage } from "@/features/autoWorkTrackers/utils/pages";
import { driverLinks } from "../utils/driverLinks";

/**
 * A three-dots button by a driver's name that drops down links to the driver's other pages (see
 * driverLinks). The schedule opens in place (its back button returns here); the other pages open
 * in a new tab, so the checks stay where they are. Nothing shows when the driver's user is not
 * known.
 */
export function DriverLinksMenu({
  userUuid,
  weekStart,
  driverName,
}: {
  userUuid: string | null | undefined;
  weekStart: string;
  driverName: string;
}) {
  const { zoneId } = useZoneWeekParams();
  const here = locatePage(usePathname());
  const area = here?.area ?? AREAS.check;
  const fromSlug = here?.page?.slug;
  if (!userUuid) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="ml-auto rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
        aria-label={`Links for ${driverName}`}
        data-testid="driver-links-menu"
      >
        <EllipsisVertical className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {driverLinks({ area, userUuid, weekStart, zoneId, fromSlug }).map((link) => (
          <DropdownMenuItem key={link.key} asChild>
            {link.newTab ? (
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-3.5 w-3.5" />
                {link.label}
              </a>
            ) : (
              <Link href={link.href}>
                <CalendarRange className="mr-2 h-3.5 w-3.5" />
                {link.label}
              </Link>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
