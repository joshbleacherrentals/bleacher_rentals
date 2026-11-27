import { test, expect } from "@playwright/test";

/**
 * S1 and S8 as an account manager (docs/specs/payment-first-installment-on-signing.md): the first
 * installment of a schedule reads "On signing", has no date input and cannot be removed.
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine).
 */
const scheduleSection = (page: import("@playwright/test").Page) =>
  page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Payment Schedule", exact: true }) });

test("S1: a new quote's first installment reads On signing, before and after saving", async ({
  page,
}) => {
  await page.goto("/quotes-bookings/new");
  const section = scheduleSection(page);
  await expect(section.getByRole("button", { name: "Edit schedule" })).toBeVisible({
    timeout: 60000,
  });
  await expect(section.getByRole("cell", { name: "On signing", exact: true })).toBeVisible();

  await section.getByRole("button", { name: "Edit schedule" }).click();
  const dialog = page.getByRole("dialog");
  // No date input for the first row, a date input for the second.
  await expect(dialog.getByLabel("Installment 1 due date")).toHaveCount(0);
  await expect(dialog.getByLabel("Installment 2 due date")).toBeVisible();
  await expect(dialog.getByText("On signing")).toBeVisible();
  await dialog.getByRole("button", { name: "Save Schedule", exact: true }).click();

  await page.getByRole("button", { name: /Add Line Item/ }).click();
  await page.getByRole("dialog").getByRole("tab", { name: "Custom Service" }).click();
  await page.getByRole("dialog").getByRole("tabpanel").getByRole("button").first().click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/quotes-bookings\/[\da-f-]+$/, { timeout: 60000 });

  await page.goto(`${page.url()}/edit`);
  await expect(section.getByRole("cell", { name: "On signing", exact: true })).toBeVisible({
    timeout: 60000,
  });
});

test("S8: the first installment cannot be removed; the others can", async ({ page }) => {
  await page.goto("/quotes-bookings/new");
  const section = scheduleSection(page);
  await expect(section.getByRole("button", { name: "Edit schedule" })).toBeVisible({
    timeout: 60000,
  });
  await section.getByRole("button", { name: "Edit schedule" }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByRole("button", { name: "Add Installment" }).click();
  await expect(dialog.getByLabel("Installment 3 percentage")).toBeVisible();

  await expect(dialog.getByRole("button", { name: "Remove installment 1" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Remove installment 2" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Remove installment 3" })).toBeEnabled();
});
