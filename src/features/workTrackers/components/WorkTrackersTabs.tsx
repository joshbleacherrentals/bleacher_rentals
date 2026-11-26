"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CalendarDays, ClipboardCheck, MapPinCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { canAccessPath } from "@/features/userAccess/accessConfig";
import { AREAS, areaHref, locatePage } from "@/features/autoWorkTrackers/utils/pages";

/**
 * The tabs across the top of Work Trackers: Weeks (paying and reading drivers' weeks), Plan Check,
 * Auto Plan and Proof of Delivery. The planning tabs carry the selected zone and week between
 * them. Shown only to someone who can open a planning tab; everyone else just has Weeks.
 */
export function WorkTrackersTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const access = useUserAccess();
  const roles = access.status === "active" ? access.roles : [];
  if (!canAccessPath(roles, AREAS.check.base)) return null;

  const current = locatePage(pathname)?.area.key ?? "weeks";
  const zone = searchParams.get("zone") ?? "";
  const week = searchParams.get("week") ?? "";

  const tabs = [
    { key: "weeks", label: "Weeks", href: "/work-trackers", Icon: CalendarDays },
    {
      key: "check",
      label: AREAS.check.label,
      href: areaHref(AREAS.check, zone, week),
      Icon: ClipboardCheck,
    },
    {
      key: "auto",
      label: AREAS.auto.label,
      href: areaHref(AREAS.auto, zone, week),
      Icon: Sparkles,
    },
    {
      key: "proof",
      label: AREAS.proof.label,
      href: areaHref(AREAS.proof, zone, week),
      Icon: MapPinCheck,
    },
  ];

  return (
    <nav
      aria-label="Work Trackers"
      className="flex shrink-0 items-end gap-1 border-b border-gray-200 bg-white px-4 pt-2"
    >
      {tabs.map(({ key, label, href, Icon }) => {
        const active = key === current;
        const ai = key === "auto";
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            data-testid={`work-trackers-tab-${key}`}
            className={cn(
              "-mb-px flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium",
              active
                ? ai
                  ? "border-violet-600 text-violet-700"
                  : "border-darkBlue text-darkBlue"
                : "border-transparent text-gray-500 hover:text-gray-800",
            )}
          >
            <Icon className={cn("h-4 w-4", ai && "text-violet-600")} />
            {ai ? (
              <span className="bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text font-semibold text-transparent">
                {label}
              </span>
            ) : (
              label
            )}
          </Link>
        );
      })}
    </nav>
  );
}
