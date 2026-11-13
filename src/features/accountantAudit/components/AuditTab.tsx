"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuditDriverInfo } from "../hooks/useAuditDriverInfo";
import { useAuditRange } from "../hooks/useAuditRange";
import { parseAuditDriver, withAuditDriver } from "../utils/auditUrlState";
import { AuditDriverPage } from "./AuditDriverPage";
import { AuditDriversList } from "./AuditDriversList";

/**
 * The body of the Audit tab: the drivers table (no `driver` in the URL) or the page of one driver.
 * It owns the three things both views share: the date range (written into the URL when it is
 * missing, D4, D13), the driver in the URL, and the removal of a driver that does not exist (R14).
 * docs/specs/accountant-audit-01-tab.md §3; accountant-audit-05-drivers-table.md §2.3.
 */
export function AuditTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { range, setRange, isInverted } = useAuditRange();

  const driver = parseAuditDriver(searchParams);
  const { info, isLoading: infoLoading } = useAuditDriverInfo(driver);
  // R14: a driver in the URL that has no row, judged once the driver query has settled.
  const isUnknown = !!driver && !infoLoading && !info;

  useEffect(() => {
    if (isUnknown) {
      router.replace(
        `${pathname}?${withAuditDriver(new URLSearchParams(searchParams.toString()), null)}`,
        {
          scroll: false,
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnknown]);

  return (
    <div data-testid="audit-tab" className="mt-5">
      {driver && !isUnknown ? (
        <AuditDriverPage
          driver={driver}
          info={info}
          range={range}
          onRangeChange={setRange}
          isInverted={isInverted}
        />
      ) : (
        <AuditDriversList range={range} onRangeChange={setRange} isInverted={isInverted} />
      )}
    </div>
  );
}
