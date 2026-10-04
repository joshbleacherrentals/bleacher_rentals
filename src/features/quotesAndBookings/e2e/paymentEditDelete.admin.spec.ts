import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const BILLING = `/quotes-bookings/${QUOTE}?tab=billing`;
const LOG = `/quotes-bookings/${QUOTE}?tab=log`;

/**
 * Editing and soft-deleting a manual payment, from the Billing tab
 * (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §4, S1–S5, S7).
 *
 * Written, not run locally. The database half — who may change which column — is asserted in
 * supabase/tests/payment_history_edit_soft_delete.test.sql; this file asserts what the screen shows.
 * Each test records its own payment, with a reference of its own, so the tests do not depend on each
 * other or on the order they run in.
 */

const row = (page: Page, text: string | RegExp) =>
  page.getByRole("row", { name: new RegExp(`Payment details for .*`) }).filter({ hasText: text });

async function recordCheck(page: Page, amount: string, reference: string) {
  await page.getByRole("button", { name: "+ Record Payment" }).click();
  await page.getByLabel(/^Amount/).fill(amount);
  await page.getByLabel("Check #").fill(reference);
  await page.getByRole("button", { name: "Record Payment", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(row(page, reference)).toBeVisible();
}

test.describe("Edit and delete a payment (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
  });

  test("S1: a manual payment has Edit and Delete; a Stripe payment has neither and says so", async ({
    page,
  }) => {
    await recordCheck(page, "25.00", "S1-REF");

    await row(page, "S1-REF").click();
    const manual = page.getByRole("dialog");
    await expect(manual.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(manual.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await row(page, "Stripe").first().click();
    const stripe = page.getByRole("dialog");
    await expect(stripe.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(stripe.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    await expect(stripe.getByText("Stripe payments cannot be edited or deleted.")).toBeVisible();
  });

  test("S2: edits the amount, and the Log tab says what changed", async ({ page }) => {
    await recordCheck(page, "100.00", "S2-REF");

    await row(page, "S2-REF").click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).click();

    const form = page.getByRole("dialog");
    await expect(form.getByText("Edit Payment")).toBeVisible();
    await form.getByLabel(/^Amount/).fill("120.00");
    await form.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await expect(row(page, "S2-REF")).toContainText("$120.00");

    await page.goto(LOG);
    await expect(page.getByText(/Payment edited/).first()).toBeVisible();
    await expect(page.getByText("Amount $100.00 → Amount $120.00").first()).toBeVisible();
  });

  test("S3: with nothing changed Save is disabled, and Cancel leaves everything as it was", async ({
    page,
  }) => {
    await recordCheck(page, "40.00", "S3-REF");

    await row(page, "S3-REF").click();
    await page.getByRole("dialog").getByRole("button", { name: "Edit", exact: true }).click();

    const form = page.getByRole("dialog");
    await expect(form.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await form.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row(page, "S3-REF")).toContainText("$40.00");
  });

  test("S4: Delete needs a reason, hides the payment, and the Log tab does not carry the reason", async ({
    page,
  }) => {
    await recordCheck(page, "55.00", "S4-REF");

    await row(page, "S4-REF").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();

    const prompt = page.getByRole("dialog");
    const confirm = prompt.getByRole("button", { name: "Delete", exact: true });
    await expect(confirm).toBeDisabled();
    await prompt.getByLabel("Reason").fill("   ");
    await expect(confirm).toBeDisabled();
    await prompt.getByLabel("Reason").fill("entered on the wrong quote");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(row(page, "S4-REF")).toHaveCount(0);

    await page.goto(LOG);
    await expect(page.getByText(/Payment deleted/).first()).toBeVisible();
    await expect(page.getByText("entered on the wrong quote")).toHaveCount(0);
  });

  test("S5: Show deleted lists the deleted payment in place, struck through, and shows who, when and why", async ({
    page,
  }) => {
    await recordCheck(page, "65.00", "S5-REF");
    await row(page, "S5-REF").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await page.getByLabel("Reason").fill("duplicate entry");
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    const received = page.getByText("Payments Received").locator("..");
    const before = await received.innerText();

    await page.getByRole("switch", { name: "Show deleted" }).click();
    await expect(row(page, "S5-REF")).toBeVisible();
    await expect(row(page, "S5-REF")).toContainText("Deleted");
    // The totals are unchanged: a deleted payment counts nowhere.
    await expect(received).toHaveText(before);

    await row(page, "S5-REF").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("This payment was deleted")).toBeVisible();
    await expect(dialog.getByText("duplicate entry")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");

    await page.getByRole("switch", { name: "Show deleted" }).click();
    await expect(row(page, "S5-REF")).toHaveCount(0);
  });

  // S8 needs a quote in another currency than USD, which the seed does not have. The rule — a payment keeps
  // its own currency when it is edited, and the log words its money in that currency — is pinned in
  // paymentEdit.test.ts and editManualPayment.test.ts, where the currency is an input.
  test.fixme("S8: a payment edited on a quote of another currency keeps its own currency", async () => {});

  test("S7: after a deletion the installment the payment was applied to can be removed from the schedule", async ({
    page,
  }) => {
    test.fixme(
      true,
      "needs a quote with a schedule that can be rebuilt; the seeded quote's schedule is shared with other specs",
    );
  });
});
