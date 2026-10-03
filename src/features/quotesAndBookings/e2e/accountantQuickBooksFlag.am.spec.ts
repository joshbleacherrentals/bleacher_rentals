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
 * The QuickBooks Invoice flag as an account manager uses it
 * (docs/specs/accountant-quotes-05-is-qbo-column.md, S3): it works exactly as before.
 *
 * Written, not run locally. The viewer's disabled checkbox (S4) is asserted in
 * quoteCapabilities.viewer.spec.ts.
 */

test.describe("QuickBooks Invoice flag (account manager)", () => {
  test("S3: the checkbox is enabled, and a tick survives a reload", async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible({
      timeout: 60_000,
    });

    await tickAndRestore(page);
  });
});
