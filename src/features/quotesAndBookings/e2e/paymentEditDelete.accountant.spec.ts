import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const BILLING = `/quotes-bookings/${QUOTE}?tab=billing`;
const LOG = `/quotes-bookings/${QUOTE}?tab=log`;

/**
 * An accountant edits and soft-deletes a manual payment, from the Billing tab
 * (docs/specs/accountant-quotes-10-accountant-writes-payments.md §5, S2 and S3).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see
 * playwright.config.ts). The screens are the ones of docs/specs/accountant-quotes-09 (the admin's
 * paymentEditDelete.admin.spec.ts); what is new is that they appear for an accountant. The database
 * half is asserted in supabase/tests/accountant_writes_payments.test.sql. Each test records its own
 * payment, with a reference of its own, so the tests do not depend on each other.
 */

const row = (page: Page, text: string | RegExp) =>
  page.getByRole("row", { name: /Payment details for .*/ }).filter({ hasText: text });

async function recordCheck(page: Page, amount: string, reference: string) {
  await page.getByRole("button", { name: "+ Record Payment" }).click();
  await page.getByLabel(/^Amount/).fill(amount);
  await page.getByLabel("Check #").fill(reference);
  await page.getByRole("button", { name: "Record Payment", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row(page, reference)).toBeVisible();
}

test.describe("Edit and delete a payment (accountant)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("S2: a manual payment has Edit and Delete; editing the amount changes the row and the Log tab says so", async ({
    page,
  }) => {
    await recordCheck(page, "100.00", "ACCT-S2");

    await row(page, "ACCT-S2").click();
    const manual = page.getByRole("dialog");
    await expect(manual.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(manual.getByRole("button", { name: "Delete", exact: true })).toBeVisible();

    await manual.getByRole("button", { name: "Edit", exact: true }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByText("Edit Payment")).toBeVisible();
    await form.getByLabel(/^Amount/).fill("120.00");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row(page, "ACCT-S2")).toContainText("$120.00");

    await page.goto(LOG);
    await expect(page.getByText(/Payment edited/).first()).toBeVisible({ timeout: 60_000 });
  });

  test("S3: deleting with a reason takes the payment out of the list; Show deleted brings it back with who, when and why", async ({
    page,
  }) => {
    await recordCheck(page, "65.00", "ACCT-S3");

    await row(page, "ACCT-S3").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    const prompt = page.getByRole("dialog");
    await prompt.getByLabel("Reason").fill("entered on the wrong quote");
    await prompt.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row(page, "ACCT-S3")).toHaveCount(0);

    // The totals do not include it, and Show deleted lists it, greyed, with a Deleted badge. An
    // accountant writes payments, so opening it also shows who deleted it, when and why.
    await page.getByRole("switch", { name: "Show deleted" }).click();
    await expect(row(page, "ACCT-S3")).toContainText("Deleted");
    await row(page, "ACCT-S3").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("This payment was deleted")).toBeVisible();
    await expect(dialog.getByText("Deleted by")).toBeVisible();
    await expect(dialog.getByText("Deleted on")).toBeVisible();
    await expect(dialog.getByText("entered on the wrong quote")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);

    // The Log tab says a payment was deleted, and does not carry the reason (spec 09, D7).
    await page.goto(LOG);
    await expect(page.getByText(/Payment deleted/).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("entered on the wrong quote")).toHaveCount(0);
  });
});
