import { test, expect } from "@playwright/test";

/**
 * POST /api/quickbooks/invoice/check, as a viewer (docs/specs/qbo-invoice-06-totals-check.md §7, S6).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). Only an admin
 * or an accountant may check an invoice; the role is checked before the body is read, so any id
 * will do and nothing is touched.
 */

test("S6: a viewer is refused with 403", async ({ page }) => {
  const res = await page.request.post("/api/quickbooks/invoice/check", {
    data: { eventId: "00000000-0000-4000-8000-000000000000" },
  });

  expect(res.status()).toBe(403);
});
