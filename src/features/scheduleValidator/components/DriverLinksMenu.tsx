"use client";

import { EllipsisVertical, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { driverLinks } from "../utils/driverLinks";

/**
 * A three-dots button by a driver's name that drops down links to the driver's other pages (see
 * driverLinks). Every link opens in a new tab, so the checks stay where they are. Nothing shows
 * when the driver's user is not known.
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
        {driverLinks({ userUuid, weekStart }).map((link) => (
          <DropdownMenuItem key={link.key} asChild>
            <a href={link.href} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-3.5 w-3.5" />
              {link.label}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
