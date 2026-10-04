import { test, expect } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two $2,700 installments, the
// first already paid by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const BILLING = `/quotes-bookings/${QUOTE}?tab=billing`;

/**
 * Manual payment entry, end to end — the part that could never be tested before,
 * because a Stripe payment needs a redirect and a card and this one does not.
 *
 * docs/specs/manual-payment-entry.md §7 (S1, S3), §10.
 */

test.describe("Record Payment (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
  });

  test("S1: records a check against an installment and closes it", async ({ page }) => {
    await page.getByRole("button", { name: "+ Record Payment" }).click();

    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Check", exact: true }).click();
    await page.getByLabel(/^Amount/).fill("2,700.00");
    await page.getByLabel("Check #").fill("1041");

    // The second installment — the first is already settled by the seeded
    // Stripe payment.
    await page.getByLabel("Apply To").selectOption({ index: 2 });

    await page.getByRole("button", { name: "Record Payment", exact: true }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("1041")).toBeVisible();
    // Both installments now settled: $5,400 of $5,400.
    await expect(page.getByText("$5,400.00").first()).toBeVisible();
  });

  test("S3: a negative amount reverses it, and says so before it is sent", async ({ page }) => {
    await page.getByRole("button", { name: "+ Record Payment" }).click();

    await page.getByLabel(/^Amount/).fill("-2,700.00");

    // The dialog must make it unmistakable that this is money going out.
    await expect(page.getByText(/records money going/i)).toBeVisible();
    const submit = page.getByRole("button", { name: "Record Refund / Adjustment" });
    await expect(submit).toBeVisible();

    await page.getByLabel("Check #").fill("1041 NSF");
    await submit.click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("-$2,700.00")).toBeVisible();
  });

  test("S6: zero is refused and cannot be sent", async ({ page }) => {
    await page.getByRole("button", { name: "+ Record Payment" }).click();

    await page.getByLabel(/^Amount/).fill("0");

    await expect(page.getByText(/cannot be zero/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Record Payment", exact: true })).toBeDisabled();
  });

  // docs/specs/accountant-quotes-09-payments-edit-delete-ui.md: this used to assert the opposite — that
  // a recorded payment offers no way to edit or delete it. A manual payment can be edited and deleted
  // now; a Stripe payment cannot, and the line under the table says so.
  test("a Stripe payment offers neither Edit nor Delete, and the line under the table says so", async ({
    page,
  }) => {
    await expect(page.getByText("Stripe payments cannot be edited or deleted.")).toBeVisible();

    await page
      .getByRole("row", { name: /Payment details for \$2,700\.00/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  });

  test("a manual payment opens with Edit and Delete", async ({ page }) => {
    await page.getByRole("button", { name: "+ Record Payment" }).click();
    await page.getByLabel(/^Amount/).fill("10.00");
    await page.getByLabel("Check #").fill("OFFERS-1");
    await page.getByRole("button", { name: "Record Payment", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page
      .getByRole("row", { name: /Payment details for \$10\.00/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  });
});
