"use client";
import { useMemo } from "react";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import {
  getQuotesBookingsCapabilities,
  type QuotesBookingsCapabilities,
} from "@/features/userAccess/logic/getQuotesBookingsCapabilities";

/**
 * "Can I do X?" on the quotes pages. The one place that reads the permissions store for it: the
 * page calls this once and hands the answers down as `can`, so no component asks who the user is.
 * Pass the quote on the card; the list passes none and reads only `createQuote`.
 */
export function useQuotesBookingsCapabilities(quote?: {
  createdByUserId?: string | null;
}): QuotesBookingsCapabilities {
  const roles = usePermissionsStore((state) => state.roles);
  const userId = usePermissionsStore((state) => state.userId);
  const leadZoneIds = usePermissionsStore((state) => state.leadZoneIds);
  const accountManagerZoneIds = usePermissionsStore((state) => state.accountManagerZoneIds);
  const createdByUserId = quote?.createdByUserId;
  const hasQuote = quote !== undefined;

  return useMemo(
    () =>
      getQuotesBookingsCapabilities({
        roles,
        userId,
        leadZoneIds,
        accountManagerZoneIds,
        quote: hasQuote ? { createdByUserId } : undefined,
      }),
    [roles, userId, leadZoneIds, accountManagerZoneIds, hasQuote, createdByUserId],
  );
}
