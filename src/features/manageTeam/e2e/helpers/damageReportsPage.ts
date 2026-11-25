import { expect, type Page } from "@playwright/test";

/** Wait for PowerSync-backed damage reports list to finish loading. */
export async function waitForDamageReportsLoaded(page: Page) {
  await expect(page.getByRole("heading", { name: "Damage Reports" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByRole("button", { name: "Create Damage Report" })).toBeVisible({
    timeout: 60_000,
  });
  const spinner = page.locator(".border-t-darkBlue.animate-spin");
  await spinner.waitFor({ state: "hidden", timeout: 120_000 }).catch(() => undefined);
}

/**
 * Opens the first open report that no repair holds. A report linked to a repair is open too, but its
 * card has no "Create Maintenance to Resolve" (docs/specs/repairs-11-dashboard.md D235), so it is
 * skipped: such a card says "Linked to:".
 */
export async function openFirstOpenDamageReportCard(page: Page) {
  const openCard = page
    .locator(".border-red-300.bg-red-50\\/30")
    .filter({ hasNotText: "Linked to:" })
    .first();
  const hasOpen = await openCard.isVisible().catch(() => false);
  if (!hasOpen) return false;
  await openCard.click();
  await expect(page.getByRole("dialog").getByText("Edit Damage Report")).toBeVisible({
    timeout: 15_000,
  });
  return true;
}

export async function showResolvedReports(page: Page) {
  const toggle = page.getByRole("button", { name: /Showing Open/i });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(page.getByRole("button", { name: /Showing Resolved/i })).toBeVisible();
  }
}

/** Toggles the "hide reports still uploading photos" filter (defaults on). */
export async function toggleHideUploadingPhotos(page: Page) {
  await page
    .getByRole("button", { name: /Hiding Uploading Photos|Showing Uploading Photos/i })
    .click();
}

export function damageReportCardByNote(page: Page, note: string) {
  return page.locator(".border.rounded-lg", { hasText: note });
}

export async function openCreateDamageReportModal(page: Page) {
  await page.getByRole("button", { name: "Create Damage Report" }).click();
  await expect(page.getByRole("dialog").getByText("Create Damage Report")).toBeVisible();
}

/** Picks "Minor" for the Seating Configuration Damage severity field. */
export async function pickSeatMinorDamage(page: Page) {
  await page.getByRole("dialog").getByRole("button", { name: "Minor" }).first().click();
}
