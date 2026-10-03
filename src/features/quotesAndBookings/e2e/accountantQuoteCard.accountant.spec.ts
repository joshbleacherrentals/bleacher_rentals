import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote with two installments, the first already paid.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const CARD = `/quotes-bookings/${QUOTE}`;

/** The URL's path, without waiting for the page to load. */
const path = (page: Page) => new URL(page.url()).pathname;

const edit = (page: Page) => page.getByRole("button", { name: "Edit", exact: true });
// The delete button is an icon with no text.
const remove = (page: Page) => page.locator('button:has(svg[class*="lucide-trash"])');

/**
 * The accountant on Quotes & Bookings: the list and the quote card, read-only, plus Files
 * (docs/specs/accountant-quotes-04-accountant-quote-access.md, S1–S7).
 *
 * Written, not run locally. This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see
 * playwright.config.ts); it needs a Clerk accountant user with a seeded Users + Accountants row.
 * The database half — what the accountant may read and write — is asserted in
 * supabase/tests/accountant_quote_card.test.sql; this file only asserts what the pages show.
 */

test.describe("Quotes & Bookings (accountant)", () => {
  test("S1: the sidebar lists Quotes & Bookings, Accountant, Work Trackers, Documentation; the list has no + Create Quote; a row opens its card", async ({
    page,
  }) => {
    await page.goto("/quotes-bookings");
    await expect(page.getByRole("heading", { name: "Quotes & Bookings" })).toBeVisible({
      timeout: 60_000,
    });

    const sidebar = page.getByTestId("sidebar");
    for (const label of ["Quotes & Bookings", "Accountant", "Work Trackers", "Role Permissions"]) {
      await expect(sidebar.getByText(label, { exact: true }), label).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "+ Create Quote" })).toHaveCount(0);

    await page.locator("tbody tr").first().click();
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}/);
  });

  test("S2: a card has all five tabs, no Edit / Delete / Send To Client / Open in Dashboard, and a Billing tab with no payments to record", async ({
    page,
  }) => {
    await page.goto(`${CARD}?tab=billing`);

    for (const tab of ["Contract", "Billing", "Files", "Log", "Messages"]) {
      await expect(page.getByRole("tab", { name: tab }), tab).toBeVisible({ timeout: 60_000 });
    }
    await expect(edit(page)).toHaveCount(0);
    await expect(remove(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send To Client" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Open in Dashboard" })).toHaveCount(0);

    await expect(page.getByRole("heading", { name: "Payment History" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Record Payment" })).toHaveCount(0);
    // Enabled since docs/specs/accountant-quotes-05: the one thing an accountant may change.
    await expect(page.getByRole("checkbox", { name: "QuickBooks Invoice" })).toBeEnabled();
  });

  test("S2: the Contract and Log tabs open and show data", async ({ page }) => {
    await page.goto(`${CARD}?tab=log`);
    await expect(page.getByRole("tab", { name: "Log" })).toHaveAttribute("data-state", "active", {
      timeout: 60_000,
    });

    await page.getByRole("tab", { name: "Contract" }).click();
    await expect(page.getByRole("tab", { name: "Contract" })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  test("S3: Files — adds a file, opens it, deletes it", async ({ page }) => {
    await page.goto(`${CARD}?tab=files`);
    await expect(page.getByRole("button", { name: "Upload File" })).toBeVisible({
      timeout: 60_000,
    });

    await page.locator('input[type="file"]').setInputFiles({
      name: "accountant-probe.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("accountant probe"),
    });
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("accountant-probe.txt")).toBeVisible();

    await page.getByTitle("Delete").first().click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText("accountant-probe.txt")).toHaveCount(0);
  });

  test("S4: Messages — the text for roles without the chat", async ({ page }) => {
    await page.goto(`${CARD}?tab=messages`);
    await expect(
      page.getByText("Internal chat is available to admins and account managers only."),
    ).toBeVisible({ timeout: 60_000 });
  });

  test("S5: /quotes-bookings/new sends the accountant back to the list", async ({ page }) => {
    await page.goto("/quotes-bookings/new").catch(() => {});
    await expect.poll(() => path(page), { timeout: 30_000 }).toBe("/quotes-bookings");
  });

  test("S6: the edit page sends the accountant to the card", async ({ page }) => {
    await page.goto(`${CARD}/edit`).catch(() => {});
    await expect.poll(() => path(page), { timeout: 30_000 }).toBe(CARD);
  });

  test("S7: a card opened directly — the breadcrumb goes to /quotes-bookings", async ({ page }) => {
    await page.goto(CARD);
    await page.getByRole("button", { name: "Quotes & Bookings" }).click();
    await expect.poll(() => path(page), { timeout: 30_000 }).toBe("/quotes-bookings");
  });

  test("S7: a card opened from the list returns to that list with its filters", async ({
    page,
  }) => {
    await page.goto("/quotes-bookings?q=a");
    await page.locator("tbody tr").first().click();
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}/);

    await page.getByRole("button", { name: "Quotes & Bookings" }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("a");
  });

  test("S7: a card opened from /accountant returns there with its tab and page", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=ar_deposits");
    await page.locator("tbody tr").first().click({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}/);

    await page.getByRole("button", { name: "Quotes & Bookings" }).click();
    await expect.poll(() => path(page), { timeout: 30_000 }).toBe("/accountant");
    expect(new URL(page.url()).searchParams.get("tab")).toBe("ar_deposits");
  });
});
