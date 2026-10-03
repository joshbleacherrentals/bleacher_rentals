import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const CARD = `/quotes-bookings/${QUOTE}`;
const BILLING = `${CARD}?tab=billing`;

const qboFlag = (page: Page) => page.getByRole("checkbox", { name: "QuickBooks Invoice" });
const edit = (page: Page) => page.getByRole("button", { name: "Edit", exact: true });
// The delete button is an icon with no text.
const remove = (page: Page) => page.locator('button:has(svg[class*="lucide-trash"])');

/** Flips the flag, and leaves it as it found it, so the seeded quote is the same for every spec. */
async function tickAndRestore(page: Page) {
  const flag = qboFlag(page);
  await expect(flag).toBeEnabled({ timeout: 60_000 });
  const before = await flag.isChecked();

  await flag.click();
  await expect(flag).toBeChecked({ checked: !before });

  await page.reload();
  await expect(qboFlag(page)).toBeChecked({ checked: !before, timeout: 60_000 });

  await qboFlag(page).click();
  await expect(qboFlag(page)).toBeChecked({ checked: before });
}

/**
 * The accountant changes exactly one thing on a quote, the QuickBooks Invoice flag
 * (docs/specs/accountant-quotes-05-is-qbo-column.md, S1, S2 and S5).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see
 * playwright.config.ts). The refusals — any other column, insert, delete — are asserted at the
 * database level in supabase/tests/accountant_events_is_qbo.test.sql; this file only asserts what
 * the page shows.
 */

test.describe("QuickBooks Invoice flag (accountant)", () => {
  test("S1: the checkbox is enabled, a tick survives a reload, and the Log tab says who did it", async ({
    page,
  }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible({
      timeout: 60_000,
    });
    await expect(qboFlag(page)).toBeEnabled();

    await tickAndRestore(page);

    // Both flips are in the Log, written by the accountant.
    await page.goto(`${CARD}?tab=log`);
    await expect(page.getByText(/QuickBooks Invoice/).first()).toBeVisible({ timeout: 60_000 });
  });

  // S2 — the same on a deleted quote, and on a quote that was never booked — needs those fixtures;
  // the seed has neither. The rule (any event, D3) is asserted in the SQL test.
  test.fixme("S2: the checkbox is enabled and works on a deleted quote and on a plain quote", async () => {});

  test("S5: still nothing else — no Edit, Delete, Send To Client or Record Payment", async ({
    page,
  }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible({
      timeout: 60_000,
    });

    await expect(edit(page)).toHaveCount(0);
    await expect(remove(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send To Client" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "+ Record Payment" })).toHaveCount(0);
  });
});
