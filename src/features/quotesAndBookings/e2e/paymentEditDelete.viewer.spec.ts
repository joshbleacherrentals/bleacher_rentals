import { test, expect } from "@playwright/test";

const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const BILLING = `/quotes-bookings/${QUOTE}?tab=billing`;

/**
 * A viewer reads the payment history and writes nothing
 * (docs/specs/accountant-quotes-09-payments-edit-delete-ui.md §4, S6).
 *
 * Written, not run locally. A deleted payment seen by someone who cannot write — the "Deleted" notice
 * and no reason, author or time — is asserted by the static render in PaymentDetailDialog.test.tsx:
 * making one here would need a payment deleted by an admin first, and the specs of one role cannot
 * depend on another's.
 */

test.describe("Edit and delete a payment (A viewer)", () => {
  test("S6: Show deleted is there, and a payment opens with neither Edit nor Delete", async ({
    page,
  }) => {
    await page.goto(BILLING);
    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();

    await expect(page.getByRole("switch", { name: "Show deleted" })).toBeVisible();

    await page
      .getByRole("row", { name: /Payment details for/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);
  });

  test("S6: turning Show deleted on and off does not move the totals", async ({ page }) => {
    await page.goto(BILLING);
    const received = page.getByText("Payments Received").locator("..");
    const before = await received.innerText();

    await page.getByRole("switch", { name: "Show deleted" }).click();
    await expect(received).toHaveText(before);
    await page.getByRole("switch", { name: "Show deleted" }).click();
    await expect(received).toHaveText(before);
  });
});
