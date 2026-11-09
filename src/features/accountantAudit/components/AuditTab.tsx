"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Truck } from "lucide-react";
import { Pagination } from "@/components/Pagination";
import { useLayoutContext } from "@/contexts/LayoutContexts";
import type { PageSize } from "@/features/quotesAndBookings/utils/pagination";
import { useAuditDriverOptions } from "../hooks/useAuditDriverOptions";
import { useAuditDriverInfo } from "../hooks/useAuditDriverInfo";
import { useAuditTrackers } from "../hooks/useAuditTrackers";
import {
  parseAuditDriver,
  parseAuditPaging,
  withAuditDriver,
  withAuditPaging,
} from "../utils/auditUrlState";
import { AuditDriverSelect } from "./AuditDriverSelect";
import { AuditDriverInfo } from "./AuditDriverInfo";
import { AuditTrackersTable } from "./AuditTrackersTable";

/**
 * The body of the Audit tab: the history of one driver's work trackers. It shows the driver select,
 * the chosen driver's details, the table of the driver's trackers with its pager, and the empty
 * state until a driver is chosen.
 * docs/specs/accountant-audit-01-tab.md §3, accountant-audit-02-driver-select.md §3,
 * accountant-audit-04-table.md §3
 */
export function AuditTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { options, isLoading } = useAuditDriverOptions();

  const driverParam = parseAuditDriver(searchParams);
  // R6: a driver that is not in the loaded list is no driver (judged only after the list loaded).
  const isUnknown = !!driverParam && !isLoading && !options.some((o) => o.id === driverParam);
  const driver = isUnknown ? null : driverParam;

  const { info, isLoading: infoLoading } = useAuditDriverInfo(driver);

  const { page, pageSize } = parseAuditPaging(searchParams);
  const {
    rows,
    total,
    page: effectivePage,
    isLoading: trackersLoading,
    error: trackersError,
  } = useAuditTrackers(driver, page, pageSize);
  const { scrollRef } = useLayoutContext();

  const setDriver = (id: string | null) =>
    router.replace(
      `${pathname}?${withAuditDriver(new URLSearchParams(searchParams.toString()), id)}`,
      {
        scroll: false,
      },
    );

  // One write for the page and the size together, then back to the top of the layout (R9).
  const setPaging = (next: { page: number; pageSize: PageSize }) => {
    router.replace(
      `${pathname}?${withAuditPaging(new URLSearchParams(searchParams.toString()), next)}`,
      { scroll: false },
    );
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    if (isUnknown) setDriver(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnknown]);

  return (
    <div data-testid="audit-tab" className="mt-5">
      <AuditDriverSelect
        options={options}
        isLoading={isLoading}
        value={driver}
        onChange={setDriver}
      />
      {driver && !infoLoading && info && <AuditDriverInfo info={info} />}
      {driver && (
        <div className="mt-5">
          <AuditTrackersTable rows={rows} isLoading={trackersLoading} error={trackersError} />
          {!trackersLoading && !trackersError && total > 0 && (
            <Pagination
              page={effectivePage}
              pageSize={pageSize}
              totalItems={total}
              onPageChange={(next) => setPaging({ page: next, pageSize })}
              onPageSizeChange={(size) => setPaging({ page: 1, pageSize: size })}
            />
          )}
        </div>
      )}
      {!driver && (
        <div
          data-testid="audit-empty-state"
          className="mt-5 flex flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white">
            <Truck
              aria-hidden="true"
              className="h-[22px] w-[22px] text-gray-600"
              strokeWidth={1.75}
            />
          </div>
          <p className="text-base font-semibold text-gray-900">Choose a driver</p>
          <p className="max-w-[420px] text-sm text-gray-600">
            Pick a driver above to see all of their work trackers and whether each one has been
            paid.
          </p>
        </div>
      )}
    </div>
  );
}
