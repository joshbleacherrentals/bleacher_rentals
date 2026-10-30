import { test, expect } from "@playwright/test";

/**
 * POST /api/quickbooks/invoice/check, as a driver (docs/specs/qbo-invoice-06a-check-on-save.md §6, S7).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). A role that
 * cannot open /quotes-bookings is refused before the body is read, so any id will do and nothing is
 * touched.
 */

test("S7: a driver is refused with 403", async ({ page }) => {
  const res = await page.request.post("/api/quickbooks/invoice/check", {
    data: { eventId: "00000000-0000-4000-8000-000000000000" },
  });

  expect(res.status()).toBe(403);
});
