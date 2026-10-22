import { test, expect } from "@playwright/test";

/**
 * POST /api/quickbooks/invoice, the update flows, as an account manager (docs/specs/qbo-invoice-05-update.md §8, S7).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). Only an admin
 * or an accountant may update an invoice; the role is checked before the body is read, so any id
 * will do and nothing is touched.
 */

test("S7: an account manager is refused with 403, whichever flow the body asks for", async ({
  page,
}) => {
  const eventId = "00000000-0000-4000-8000-000000000000";

  for (const data of [
    { eventId },
    { eventId, replaceMissing: true },
    { eventId, overwriteInvoiceId: "1" },
  ]) {
    const res = await page.request.post("/api/quickbooks/invoice", { data });
    expect(res.status()).toBe(403);
  }
});
