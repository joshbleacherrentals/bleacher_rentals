import { expect, type Page } from "@playwright/test";
import { SERVICE_TIRES, SERVICE_WELDING, usd, type SeededRepairs } from "./repairsFixtures";
import { bleacherQuery, openButtonOf, openRepairsPage, rowWith, windowOf } from "./repairsPage";

/**
 * What every role that opens the Repairs page can do with the repair window, read-only: open it
 * with the button at the end of a row, read the title, the vendor and its address, the services
 * with the Total row, open a service over it, and (for three roles) see the files.
 * Shared by scenario S33 of the three role specs.
 * docs/specs/repairs-07-repair-window.md §6.
 */
export async function readRepairWindow(
  page: Page,
  seeded: SeededRepairs,
  options: { canSeeFiles: boolean },
) {
  await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
  const done = rowWith(page, seeded.completed.invoice);
  await expect(done).toBeVisible({ timeout: 60_000 });

  await openButtonOf(done).click();
  const win = windowOf(page, "repair");
  await expect(win).toBeVisible();
  await expect(
    win.getByRole("heading", { name: `${seeded.completed.invoice} · ${seeded.vendorName}` }),
  ).toBeVisible();
  await expect(win.locator('[data-field="vendor"]')).toContainText(seeded.vendorName);
  await expect(win.locator('[data-field="address"]')).toHaveText(seeded.vendorAddress);

  // The services with the Total row: the repair's total is the one of the Total column.
  const table = win.getByTestId("repair-window-services");
  await expect(table.getByTestId("repair-service-row")).toHaveCount(2);
  const total = win.getByTestId("repair-window-total");
  await expect(total.locator('[data-col="total-labor"]')).toHaveText(
    usd(SERVICE_TIRES.labor + SERVICE_WELDING.labor),
  );
  await expect(total.locator('[data-col="total-total"]')).toHaveText(
    usd(seeded.completed.totalCents),
  );

  // Nothing that writes, and no Open repair in the repair window itself.
  await expect(
    win.getByRole("button", { name: /Edit|Delete|Add service|Open repair/ }),
  ).toHaveCount(0);

  // A service opened from the repair window has no Open repair button (D98).
  await table.getByTestId("repair-service-row").filter({ hasText: "Tires" }).click();
  const service = windowOf(page, "service");
  await expect(service).toBeVisible();
  await expect(service.getByTestId("service-window-open-repair")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(service).toHaveCount(0);
  await expect(win).toBeVisible();

  // The files: three roles see them, the viewer does not see the section at all (D102).
  const files = win.getByTestId("repair-files");
  if (options.canSeeFiles) {
    await expect(files.getByTestId("repair-file")).toHaveCount(2);
    await expect(files.getByTestId("repair-file").nth(0)).toContainText("Photo 1");
    await expect(files.getByTestId("repair-file").nth(1)).toContainText("PDF 1");
  } else {
    await expect(files).toHaveCount(0);
    await expect(win.getByRole("heading", { name: "Files" })).toHaveCount(0);
  }
}
