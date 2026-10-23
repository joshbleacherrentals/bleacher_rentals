import { test, expect } from "@playwright/test";

/**
 * POST /api/quickbooks/invoice/check, as a viewer (docs/specs/qbo-invoice-06a-check-on-save.md §6, S2 and S7).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). Any role that
 * may open /quotes-bookings may call the route, so a viewer is no longer refused with 403; a
 * quote that does not exist, or that their own token cannot read, is a 404, and nothing is touched.
 */

test("S7: a viewer passes the role check, and a quote that does not exist is a 404", async ({
  page,
}) => {
  const res = await page.request.post("/api/quickbooks/invoice/check", {
    data: { eventId: "00000000-0000-4000-8000-000000000000" },
  });

  expect(res.status()).toBe(404);
  expect((await res.json()).error).toBe("Quote not found.");
});
