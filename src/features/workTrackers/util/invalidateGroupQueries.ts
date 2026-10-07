import type { QueryClient } from "@tanstack/react-query";

/** The driver page's own read of one driver's week (page.tsx), keyed `[this, userUuid, startDate]`. */
export const DRIVER_WITH_META_QUERY_KEY = "driver-with-meta";
export const DRIVERS_FOR_WEEK_QUERY_KEY = "drivers-for-week";

/**
 * Makes every react-query read of a driver's week group fetch again. The payment window writes a
 * group's status straight to Supabase, and the driver page shows that status from a react-query
 * read rather than from the local database, so it stays on the old value until it is told.
 * Every handler that changes a group goes through here: two of them once kept their own list of
 * keys and left out the driver page's, and its status button stayed on Draft after "Mark as Ready
 * for Payment".
 */
export async function invalidateGroupQueries(
  queryClient: Pick<QueryClient, "invalidateQueries">,
): Promise<void> {
  await Promise.all(
    [DRIVERS_FOR_WEEK_QUERY_KEY, DRIVER_WITH_META_QUERY_KEY].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key], refetchType: "active" }),
    ),
  );
}
