import { test, expect, type Page, type TestInfo } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const INVOICE = `/accountant/invoice?id=${QUOTE}`;
const LOG = `/quotes-bookings/${QUOTE}?tab=log`;

/**
 * An accountant attaches and deletes a file in the invoice page's Files section and the quote's Log
 * has the rows (docs/specs/event-change-log-02-file-upload-delete.md §4, S3).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see
 * playwright.config.ts). The invoice page and the quote's Files tab use the same two helpers, so the
 * rows are written by the same functions; what is asserted here is that they reach the Log of the
 * quote for a role that is not an admin, under the accountant's name.
 */

const stamp = (testInfo: TestInfo) => `${Date.now()}-${testInfo.workerIndex}`;

const files = (page: Page) => page.getByRole("region", { name: "Files" });

const logRow = (page: Page, text: string | RegExp) =>
  page.getByRole("button").filter({ hasText: text });

test.describe("Files uploaded and deleted in the Log (accountant)", () => {
  test("S3: a file attached and deleted on the invoice page is on the quote's Log", async ({
    page,
  }, testInfo) => {
    const name = `acct-log-${stamp(testInfo)}.pdf`;
    await page.goto(INVOICE);

    await files(page)
      .locator('input[type="file"]')
      .setInputFiles({
        name,
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% e2e file log\n"),
      });
    await expect(files(page).getByText("Ready to Upload (1)")).toBeVisible({ timeout: 60_000 });
    await files(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(files(page).getByRole("button", { name: `Download ${name}` })).toBeVisible({
      timeout: 60_000,
    });

    await files(page)
      .getByRole("button", { name: `Delete ${name}` })
      .click();
    await page
      .getByRole("alertdialog", { name: "Delete file?" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(files(page).getByText(name)).toHaveCount(0, { timeout: 60_000 });

    await page.goto(LOG);
    const uploaded = logRow(page, `File uploaded: ${name}`);
    const deleted = logRow(page, `File deleted: ${name}`);
    await expect(uploaded).toBeVisible({ timeout: 60_000 });
    await expect(deleted).toBeVisible();
    // The author is the accountant, not the "System" of a row with nobody behind it.
    await expect(uploaded).not.toContainText("System");
    await expect(deleted).not.toContainText("System");
  });
});
