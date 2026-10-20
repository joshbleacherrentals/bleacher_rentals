import { test, expect, type Page } from "@playwright/test";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

// Seeded in supabase/seed.sql: a booked quote (same one quoteCapabilities.am.spec.ts uses).
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const CARD = `/quotes-bookings/${QUOTE}`;

/**
 * Send To Client with Cc, Bcc, a changed subject and changed attachments
 * (docs/specs/quote-send-email-options.md §10, Playwright).
 *
 * Written, not run locally, as agreed. It sends a real email through the configured Postmark
 * server, so it needs the development allowlist to include the addresses below (spec F5);
 * otherwise the server drops them and refuses the send.
 */

const TO_CHECK = "To";
const CC = "e2e-cc@example.com";
const BCC = "e2e-bcc@example.com";
const SUBJECT = "E2E custom subject";

async function addChip(page: Page, label: "To" | "Cc" | "Bcc", address: string) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.fill(address);
  await input.press("Enter");
  await expect(page.getByRole("button", { name: `Remove ${address} from ${label}` })).toBeVisible();
}

test.describe("Send To Client options (account manager)", () => {
  test("adds Cc and Bcc, changes the subject, adds a file, and sends", async ({
    page,
  }, testInfo) => {
    const filePath = path.join(os.tmpdir(), `e2e-attachment-${testInfo.workerIndex}.pdf`);
    fs.writeFileSync(filePath, "%PDF-1.4\n% e2e attachment\n");
    const fileName = path.basename(filePath);

    await page.goto(CARD);
    await page.getByRole("button", { name: "Send To Client" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Review before sending")).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: TO_CHECK, exact: true })).toBeVisible({
      timeout: 60_000,
    });

    // An invalid address and an address already present are refused with a message.
    const cc = dialog.getByRole("combobox", { name: "Cc", exact: true });
    await cc.fill("not-an-address");
    await cc.press("Enter");
    await expect(dialog.getByRole("alert").filter({ hasText: "not a valid email" })).toBeVisible();
    await cc.fill("");

    await addChip(page, "Cc", CC);
    await addChip(page, "Bcc", BCC);
    const bcc = dialog.getByRole("combobox", { name: "Bcc", exact: true });
    await bcc.fill(CC);
    await bcc.press("Enter");
    await expect(dialog.getByRole("alert").filter({ hasText: "already in Cc" })).toBeVisible();
    await bcc.fill("");

    // A file from the computer waits in the list and is uploaded only on Send.
    await dialog.getByTestId("send-add-file-input").setInputFiles(filePath);
    await expect(dialog.getByText(fileName)).toBeVisible();
    await expect(dialog.getByText("will be uploaded on Send")).toBeVisible();

    // Subject: clearing it shows the placeholder and keeps Send enabled; then set a custom one.
    const subject = dialog.getByLabel("Subject");
    await subject.fill("");
    await expect(subject).toHaveAttribute(
      "placeholder",
      "Leave empty to send the template's subject",
    );
    await expect(dialog.getByRole("button", { name: "Send", exact: true })).toBeEnabled();
    await subject.fill(SUBJECT);

    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog.getByText("Quote sent!")).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Done" }).click();

    // Log tab, Internal Activity: the change-log line records every recipient (spec D10).
    await page.goto(`${CARD}?tab=log`);
    await expect(
      page.getByText(new RegExp(`Quote Sent to To: .*; Cc: ${CC}; Bcc: ${BCC}`)).first(),
    ).toBeVisible({ timeout: 60_000 });

    // Automatic Emails: addresses, subject and attachment names.
    await page.getByRole("button", { name: /Automatic Emails/ }).click();
    await expect(page.getByText(SUBJECT).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(CC).first()).toBeVisible();
    await expect(page.getByText(BCC).first()).toBeVisible();
    await expect(page.getByText(fileName).first()).toBeVisible();

    // Files tab: the added file, with its source (recorded by the server only after the send, D14).
    await page.goto(`${CARD}?tab=files`);
    await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Email Attachment").first()).toBeVisible();
  });

  test("the quote PDF cannot be removed; a template file can", async ({ page }) => {
    await page.goto(CARD);
    await page.getByRole("button", { name: "Send To Client" }).click();
    const dialog = page.getByRole("dialog");
    // Scoped to the attachments region so the To/Cc/Bcc chips' remove buttons never match.
    const attachments = dialog.getByRole("region", { name: /^Attachments/ });
    await expect(attachments).toBeVisible({ timeout: 60_000 });

    const pdfItem = attachments.getByRole("listitem").filter({ hasText: "Always attached" });
    await expect(pdfItem).toHaveCount(1);
    await expect(pdfItem.getByRole("button")).toHaveCount(0);

    const templateRemove = attachments
      .getByRole("listitem")
      .filter({ hasNotText: "Always attached" })
      .getByRole("button", { name: /^Remove / });
    test.skip(
      (await templateRemove.count()) === 0,
      "The seeded quote email template has no attachments, so there is no template file to remove.",
    );
    const before = await attachments.getByRole("listitem").count();
    await templateRemove.first().click();
    await expect(attachments.getByRole("listitem")).toHaveCount(before - 1);
  });

  test("cancelling the dialog uploads nothing", async ({ page }, testInfo) => {
    const filePath = path.join(os.tmpdir(), `e2e-cancelled-${testInfo.workerIndex}.pdf`);
    fs.writeFileSync(filePath, "%PDF-1.4\n% e2e cancelled\n");
    const fileName = path.basename(filePath);

    await page.goto(CARD);
    await page.getByRole("button", { name: "Send To Client" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("send-add-file-input").setInputFiles(filePath);
    await expect(dialog.getByText(fileName)).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await page.goto(`${CARD}?tab=files`);
    await expect(page.getByText("Project Files")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(fileName)).toHaveCount(0);
  });

  test("a failed send saves the added file nowhere in Files (D14)", async ({ page }, testInfo) => {
    const filePath = path.join(os.tmpdir(), `e2e-failed-${testInfo.workerIndex}.pdf`);
    fs.writeFileSync(filePath, "%PDF-1.4\n% e2e failed send\n");
    const fileName = path.basename(filePath);

    await page.route("**/api/quotes/*/send", (route) =>
      route.fulfill({ status: 500, json: { error: "Postmark is down (e2e)" } }),
    );
    await page.goto(CARD);
    await page.getByRole("button", { name: "Send To Client" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByTestId("send-add-file-input").setInputFiles(filePath);
    await expect(dialog.getByText(fileName)).toBeVisible({ timeout: 60_000 });
    await dialog.getByRole("button", { name: "Send", exact: true }).click();
    await expect(dialog.getByText("The quote was not sent")).toBeVisible({ timeout: 60_000 });
    await dialog.getByTestId("send-error-close").click();

    await page.goto(`${CARD}?tab=files`);
    await expect(page.getByText("Project Files")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(fileName)).toHaveCount(0);
  });
});
