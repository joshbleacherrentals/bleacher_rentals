import { test, expect } from "@playwright/test";

test("new quotes have a percentage schedule that follows the price and survives reload", async ({
  page,
}) => {
  await page.goto("/quotes-bookings/new");
  const section = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Payment Schedule", exact: true }) });
  await expect(section.getByRole("button", { name: "Edit schedule" })).toBeVisible({
    timeout: 60000,
  });
  await expect(section.getByRole("cell", { name: "50%", exact: true })).toHaveCount(2);
  await expect(section.getByRole("button", { name: "Set up schedule" })).toHaveCount(0);

  await page.getByRole("button", { name: /Add Line Item/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Custom Service" }).click();
  await dialog.getByRole("tabpanel").getByRole("button").first().click();
  const price = page
    .locator("table")
    .filter({ has: page.getByRole("spinbutton") })
    .getByRole("spinbutton")
    .last();
  await price.fill("1000");
  await expect(section.getByRole("cell", { name: "$500.00", exact: true })).toHaveCount(2);
  await price.fill("2000");
  await expect(section.getByRole("cell", { name: "$1,000.00", exact: true })).toHaveCount(2);
  await expect(section.getByRole("cell", { name: "50%", exact: true })).toHaveCount(2);

  await section.getByRole("button", { name: "Edit schedule" }).click();
  await expect(dialog.getByRole("spinbutton")).toHaveCount(2);
  await dialog.getByLabel("Installment 1 percentage").fill("40");
  await expect(dialog.getByRole("button", { name: "Percentages must total 100%" })).toBeDisabled();
  await dialog.getByLabel("Installment 2 percentage").fill("60");
  await dialog.getByRole("button", { name: "Save Schedule", exact: true }).click();
  await expect(section.getByRole("cell", { name: "$800.00", exact: true })).toBeVisible();
  await expect(section.getByRole("cell", { name: "$1,200.00", exact: true })).toBeVisible();
  // Save through the normal UI; returning to edit reads percentages from PowerSync.
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(/\/quotes-bookings\/[\da-f-]+$/, { timeout: 60000 });
  const detail = page.url();
  await page.goto(`${detail}/edit`);
  await expect(section.getByRole("cell", { name: "40%", exact: true })).toBeVisible({
    timeout: 60000,
  });
  await expect(section.getByRole("cell", { name: "$800.00", exact: true })).toBeVisible();
  await page.reload();
  await expect(section.getByRole("cell", { name: "60%", exact: true })).toBeVisible({
    timeout: 60000,
  });
});
