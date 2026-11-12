import { test, expect, type Page, type TestInfo } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid by Stripe.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const FILES = `/quotes-bookings/${QUOTE}?tab=files`;
const LOG = `/quotes-bookings/${QUOTE}?tab=log`;

/**
 * Upload file and Delete file write a row to the Log
 * (docs/specs/event-change-log-02-file-upload-delete.md §4, S1, S2, S4 and S5).
 *
 * Written, not run locally (project rule). What each row says (field `file`, the name in the next
 * value of an upload and the previous value of a delete), who is the author, and that `removeEventFile`
 * gets the quote's id as its third parameter (A1) are pinned in the Vitest files of the helpers and of
 * the two components; this file asserts what the Files and Log tabs show. Every test names its files
 * with a stamp of its own, so the tests do not depend on each other, on the order they run in, or on
 * what an earlier run left in the seeded quote.
 */

const stamp = (testInfo: TestInfo) => `${Date.now()}-${testInfo.workerIndex}`;

const pdf = (name: string) => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.from("%PDF-1.4\n% e2e file log\n"),
});

/** One row of the Log tab's Internal Activity list. */
const logRow = (page: Page, text: string | RegExp) =>
  page.getByRole("button").filter({ hasText: text });

/** Stages the files on the Files tab and saves them; returns when the last one is listed. */
async function uploadFiles(page: Page, names: string[]) {
  await page.goto(FILES);
  await expect(page.getByText("Project Files")).toBeVisible({ timeout: 60_000 });
  await page.locator('input[type="file"]').setInputFiles(names.map(pdf));
  await expect(page.getByText(`Ready to Upload (${names.length})`)).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  for (const name of names) {
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible({ timeout: 60_000 });
  }
  await expect(page.getByText("Ready to Upload")).toHaveCount(0);
}

test.describe("Files uploaded and deleted in the Log (admin)", () => {
  test("S1: two files saved together are two rows in the Log, with the admin's name", async ({
    page,
  }, testInfo) => {
    const a = `log-a-${stamp(testInfo)}.pdf`;
    const b = `log-b-${stamp(testInfo)}.pdf`;
    await uploadFiles(page, [a, b]);

    await page.goto(LOG);
    const first = logRow(page, `File uploaded: ${a}`);
    const second = logRow(page, `File uploaded: ${b}`);
    await expect(first).toHaveCount(1);
    await expect(second).toHaveCount(1);
    // One file is one row, and each carries the admin, not the "System" of a row with nobody behind it.
    await expect(first).not.toContainText("System");
    await expect(second).not.toContainText("System");

    // Opened, the row says the file once more, and none of the send dialog's note.
    await first.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(`File uploaded: ${a}`)).toBeVisible();
    await expect(dialog.getByText("Attached to the email")).toHaveCount(0);
  });

  test("S2: a deleted file is a File deleted row, above the one that recorded its upload", async ({
    page,
  }, testInfo) => {
    const name = `log-del-${stamp(testInfo)}.pdf`;
    await uploadFiles(page, [name]);

    await page.getByRole("row").filter({ hasText: name }).getByTitle("Delete").click();
    await page
      .getByRole("alertdialog", { name: "Delete file?" })
      .getByRole("button", { name: "Delete", exact: true })
      .click();
    await expect(page.getByRole("row").filter({ hasText: name })).toHaveCount(0, {
      timeout: 60_000,
    });

    await page.goto(LOG);
    await expect(logRow(page, `File deleted: ${name}`)).toHaveCount(1);
    await expect(logRow(page, `File deleted: ${name}`)).not.toContainText("System");
    // The upload row stays: the Log is a history, and nothing in it is rewritten.
    await expect(logRow(page, `File uploaded: ${name}`)).toHaveCount(1);

    // Newest first: the delete sits above the upload.
    const titles = await page
      .getByRole("button")
      .filter({ hasText: /File (uploaded|deleted):/ })
      .allInnerTexts();
    const deleted = titles.findIndex((t) => t.includes(`File deleted: ${name}`));
    const uploaded = titles.findIndex((t) => t.includes(`File uploaded: ${name}`));
    expect(deleted).toBeGreaterThanOrEqual(0);
    expect(uploaded).toBeGreaterThanOrEqual(0);
    expect(deleted).toBeLessThan(uploaded);
  });

  test("S4: a file refused for its type or size leaves no row", async ({ page }, testInfo) => {
    const refusedType = `log-refused-${stamp(testInfo)}.zip`;
    const refusedSize = `log-huge-${stamp(testInfo)}.pdf`;
    await page.goto(FILES);
    await expect(page.getByText("Project Files")).toBeVisible({ timeout: 60_000 });

    const input = page.locator('input[type="file"]');
    await input.setInputFiles({
      name: refusedType,
      mimeType: "application/zip",
      buffer: Buffer.from("PK"),
    });
    await expect(page.getByText("Invalid file type")).toBeVisible();
    await input.setInputFiles({
      name: refusedSize,
      mimeType: "application/pdf",
      buffer: Buffer.alloc(21 * 1024 * 1024),
    });
    await expect(page.getByText("File too large")).toBeVisible();
    await expect(page.getByText("Ready to Upload")).toHaveCount(0);

    // The Log has loaded once its sub-tab bar is up; only then can "no row" mean anything.
    await page.goto(LOG);
    await expect(page.getByRole("button", { name: /Internal Activity/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(logRow(page, refusedType)).toHaveCount(0);
    await expect(logRow(page, refusedSize)).toHaveCount(0);
  });

  // Sends a real e-mail through the configured Postmark server, like sendQuoteOptions.am.spec.ts, so
  // it needs the development allowlist to include the recipient of the seeded quote.
  test("S5: a file added in the send dialog is still File added, with its note", async ({
    page,
  }, testInfo) => {
    const name = `log-sent-${stamp(testInfo)}.pdf`;
    await page.goto(`/quotes-bookings/${QUOTE}`);
    await page.getByRole("button", { name: "Send To Client" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Review before sending")).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "To", exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByTestId("send-add-file-input").setInputFiles(pdf(name));
    await expect(dialog.getByText(name)).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog.getByText("Quote sent!")).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Done" }).click();

    await page.goto(LOG);
    const added = logRow(page, `File added: ${name}`);
    await expect(added).toBeVisible({ timeout: 60_000 });
    await expect(added).toContainText("Attached to the email and saved to Files");
    // It is not an upload by hand: the send dialog's row keeps its own type.
    await expect(logRow(page, `File uploaded: ${name}`)).toHaveCount(0);
  });
});
