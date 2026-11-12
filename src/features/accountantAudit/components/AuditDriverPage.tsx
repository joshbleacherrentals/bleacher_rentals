"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { useLayoutContext } from "@/contexts/LayoutContexts";
import type { PageSize } from "@/features/quotesAndBookings/utils/pagination";
import type { AuditDriverInfo as AuditDriverInfoData } from "../db/auditDriverInfo";
import { useAuditTrackers } from "../hooks/useAuditTrackers";
import type { AuditRange } from "../utils/auditRange";
import { parseAuditPaging, withAuditDriver, withAuditPaging } from "../utils/auditUrlState";
import { AuditAvatar } from "./AuditAvatar";
import { AuditDriverInfo } from "./AuditDriverInfo";
import { AuditRangeControls } from "./AuditRangeControls";
import { AuditTrackersTable } from "./AuditTrackersTable";

type Props = {
  driver: string;
  /** Null while the driver's details load. */
  info: AuditDriverInfoData | null;
  range: AuditRange;
  onRangeChange: (range: AuditRange) => void;
  isInverted: boolean;
};

/**
 * The page of one driver (`driver` in the URL): the Back link and the driver's name, the details
 * block, the range controls, and the driver's trackers inside the range with their pager.
 * docs/specs/accountant-audit-05-drivers-table.md §2.3 (D8, D9, D10, R12, R13); the table and the
 * pager are specs 03 and 04.
 */
export function AuditDriverPage({ driver, info, range, onRangeChange, isInverted }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { scrollRef } = useLayoutContext();

  const { page, pageSize } = parseAuditPaging(searchParams);
  const {
    rows,
    total,
    page: effectivePage,
    isLoading,
    error,
  } = useAuditTrackers(driver, range, page, pageSize);

  // R12: the same URL without `driver` (and `apage`), every other parameter kept.
  const backHref = `${pathname}?${withAuditDriver(new URLSearchParams(searchParams.toString()), null)}`;

  // One write for the page and the size together, then back to the top of the layout (spec 04 R9).
  const setPaging = (next: { page: number; pageSize: PageSize }) => {
    router.replace(
      `${pathname}?${withAuditPaging(new URLSearchParams(searchParams.toString()), next)}`,
      { scroll: false },
    );
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const name = info
    ? [info.firstName, info.lastName].filter(Boolean).join(" ") || "Unknown Driver"
    : "";

  return (
    <div data-testid="audit-driver-page">
      <Link
        href={backHref}
        data-testid="audit-back"
        className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-darkBlue"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Back
      </Link>
      {/* One card for who the driver is: initials and name, then the contact details. */}
      {info && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <AuditAvatar name={name} size="lg" />
            <h2 data-testid="audit-driver-name" className="text-2xl font-bold text-darkBlue">
              {name}
            </h2>
            {info.isInactive && (
              <span
                data-testid="audit-driver-inactive"
                className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
              >
                Inactive
              </span>
            )}
          </div>
          <AuditDriverInfo info={info} />
        </div>
      )}
      <div className="mt-4">
        <AuditRangeControls range={range} onChange={onRangeChange} />
      </div>
      <div className="mt-4">
        {isInverted ? (
          <div
            data-testid="audit-driver-message"
            role="alert"
            className="rounded-xl border border-gray-200 bg-white py-12 text-center text-sm text-red-600 shadow-sm"
          >
            The start date is after the end date.
          </div>
        ) : (
          <>
            <AuditTrackersTable rows={rows} isLoading={isLoading} error={error} />
            {!isLoading && !error && total > 0 && (
              <Pagination
                page={effectivePage}
                pageSize={pageSize}
                totalItems={total}
                onPageChange={(next) => setPaging({ page: next, pageSize })}
                onPageSizeChange={(size) => setPaging({ page: 1, pageSize: size })}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
