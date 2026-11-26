"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronsLeft,
  ClipboardCheck,
  Check,
  House,
  Loader2,
  MapPinCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { pageHref, type Area, type AreaKey } from "../utils/pages";
import { summaryTone } from "../utils/checkSummaries";
import { useChecksOrNull, type CheckStatus } from "./ChecksProvider";
import { ModelTrackersPanel } from "./ModelTrackersPanel";
import { AdvancedSettingsButton } from "./AdvancedSettingsButton";
import { ZoneWeekPicker } from "./ZoneWeekPicker";

export const SIDEBAR_WIDTH = 288; // px — Tailwind's w-72

/**
 * How a page's check came out: a spinner while it runs, a check when there was nothing to check, or
 * passed/total, green when all passed and red when any failed.
 */
function CheckBadge({ status }: { status: CheckStatus }) {
  if (status.isLoading) {
    return (
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin opacity-60" aria-label="Checking" />
    );
  }
  const { summary } = status;
  if (!summary) return null;
  const good = summaryTone(summary) === "good";
  const color = good ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800";
  const label = `${summary.passed} of ${summary.total} passed`;
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums ${color}`}
      title={label}
      aria-label={label}
      data-testid="check-badge"
      data-tone={good ? "good" : "bad"}
    >
      {summary.total === 0 ? (
        <Check className="my-0.5 h-3.5 w-3.5" />
      ) : (
        `${summary.passed}/${summary.total}`
      )}
    </span>
  );
}

const AREA_ICON: Record<AreaKey, typeof Sparkles> = {
  check: ClipboardCheck,
  auto: Sparkles,
  proof: MapPinCheck,
};

/**
 * The pinned left-hand panel of a planning tab, styled like the Quotes & Bookings filters: the zone
 * and week, then the tab's pages grouped under headings. Auto Plan adds the model's tracker counts
 * (and their bulk delete) and Advanced settings. Each heading folds; the one holding the open page
 * stays open.
 */
export function AutoWorkTrackersSidebar({
  area,
  isOpen,
  onToggle,
  activeSlug,
  zoneId,
  weekStart,
  onZoneChange,
  onWeekChange,
}: {
  area: Area;
  isOpen: boolean;
  onToggle: () => void;
  activeSlug: string | undefined;
  zoneId: string;
  weekStart: string;
  onZoneChange: (zoneId: string) => void;
  onWeekChange: (weekStart: string) => void;
}) {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const statuses = useChecksOrNull()?.statuses ?? {};
  const AreaIcon = AREA_ICON[area.key];
  const home = area.home;

  const toggleSection = (label: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  // Stays mounted so the width can animate: the aside grows and shrinks while the inner panel keeps
  // its full width and is clipped, so nothing reflows mid-animation.
  return (
    <aside
      aria-label={area.label}
      aria-hidden={!isOpen}
      inert={!isOpen}
      style={{ width: isOpen ? SIDEBAR_WIDTH : 0 }}
      className="h-full shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out motion-reduce:transition-none"
    >
      <div
        style={{ width: SIDEBAR_WIDTH }}
        className="flex h-full flex-col border-r border-gray-200 bg-gray-100"
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <AreaIcon className="h-4 w-4" />
            {area.label}
          </div>
          <button
            type="button"
            onClick={onToggle}
            title="Hide panel"
            aria-label="Hide panel"
            aria-expanded
            className="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-200"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-3">
          <ZoneWeekPicker
            idPrefix={`work-trackers-${area.key}`}
            zoneId={zoneId}
            weekStart={weekStart}
            onZoneChange={onZoneChange}
            onWeekChange={onWeekChange}
            stacked
          />
          {area.key === "auto" && (
            <>
              <ModelTrackersPanel zoneId={zoneId} weekStart={weekStart} />
              <AdvancedSettingsButton />
            </>
          )}

          {area.sections.length > 0 && (
            <nav aria-label={`${area.label} pages`} className="border-t border-gray-200 pt-3">
              {/* The home page stands on its own above the headings, like a home link. */}
              <Link
                href={pageHref(area, home, zoneId, weekStart)}
                aria-current={activeSlug === home.slug ? "page" : undefined}
                className={cn(
                  "mb-3 flex items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold",
                  activeSlug === home.slug
                    ? "bg-darkBlue text-white"
                    : "text-gray-800 hover:bg-gray-200",
                )}
              >
                {area.key === "auto" ? (
                  <Sparkles className="h-4 w-4 shrink-0" />
                ) : (
                  <House className="h-4 w-4 shrink-0" />
                )}
                {home.label}
              </Link>

              {area.sections.map((section) => {
                const holdsActive = section.pages.some((p) => p.slug === activeSlug);
                const open = holdsActive || !folded.has(section.label);
                return (
                  <div key={section.label} className="mb-2">
                    <button
                      type="button"
                      onClick={() => toggleSection(section.label)}
                      disabled={holdsActive}
                      aria-expanded={open}
                      className="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1 text-xs font-semibold tracking-wide text-gray-500 uppercase hover:bg-gray-200 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      {section.label}
                      <ChevronDown
                        className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")}
                      />
                    </button>
                    {open && (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {section.pages.map((page) => {
                          const active = page.slug === activeSlug;
                          const status = statuses[page.slug];
                          return (
                            <li key={page.slug}>
                              <Link
                                href={pageHref(area, page, zoneId, weekStart)}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                  "flex items-center justify-between gap-2 rounded px-2 py-1.5 text-sm",
                                  active
                                    ? "bg-darkBlue font-medium text-white"
                                    : "text-gray-700 hover:bg-gray-200",
                                )}
                              >
                                <span className="truncate">{page.label}</span>
                                {status && <CheckBadge status={status} />}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
            </nav>
          )}
        </div>
      </div>
    </aside>
  );
}
