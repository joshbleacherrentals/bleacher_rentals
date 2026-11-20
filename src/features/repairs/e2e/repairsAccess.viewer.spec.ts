import { test, expect } from "@playwright/test";
import { seedRepairs, usd, type SeededRepairs } from "./helpers/repairsFixtures";
import { readRepairWindow } from "./helpers/repairWindowFlow";
import { readServicesAndReport } from "./helpers/serviceFlow";
import {
  bleacherQuery,
  cellOf,
  filterButton,
  openRepairsPage,
  repairRows,
  rowWith,
  searchBox,
  toggleOption,
} from "./helpers/repairsPage";

/**
 * The Repairs page as a viewer sees it: the whole table, vendors and money included, no Restore
 * and a click on a row that opens its block of services. Written, not run (project rule).
 * Spec: docs/specs/repairs-04-table.md §6 (S10, D52), docs/specs/repairs-05-toolbar.md §6 (S20)
 * docs/specs/repairs-06-expanded-row.md §6 (S27) and docs/specs/repairs-07-repair-window.md §6 (S33).
 */
test.describe("Repairs page (viewer)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S10: sees the vendor, the invoice number, the amounts and the strip", async ({ page }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(done, "vendor")).toHaveText(seeded.vendorName);
    await expect(cellOf(done, "invoice")).toHaveText(seeded.completed.invoice);
    await expect(cellOf(done, "total")).toHaveText(usd(seeded.completed.totalCents));
    await expect(page.getByTestId("repairs-strip-usd")).toHaveText(
      usd(seeded.completed.totalCents),
    );
  });

  test("S10: there is no Restore, and a click on a row opens no dialog", async ({ page }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await done.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByTestId("repair-restore")).toHaveCount(0);
  });

  test("S10: the Show Deleted button is not there", async ({ page }) => {
    await openRepairsPage(page);
    await expect(page.getByRole("button", { name: "Show Deleted" })).toHaveCount(0);
  });

  test("S20: the search and the Vendor filter narrow the list, and ?showDeleted=1 shows nothing deleted", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    await expect(rowWith(page, seeded.completed.invoice)).toHaveCount(1, { timeout: 60_000 });
    await searchBox(page).fill(seeded.completed.invoice);
    await expect(repairRows(page)).toHaveCount(1);
    await searchBox(page).fill("");
    await toggleOption(page, "vendor", seeded.vendorName);
    await expect(filterButton(page, "vendor")).toContainText("1");
    await expect(repairRows(page)).toHaveCount(1);

    // Without the right to Show Deleted the address changes nothing and there is no button.
    await openRepairsPage(
      page,
      bleacherQuery(seeded.bleacherA.uuid, "&tab=completed&showDeleted=1"),
    );
    await expect(rowWith(page, seeded.completed.invoice)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowWith(page, seeded.deleted.invoice)).toHaveCount(0);
    await expect(page.getByTestId("repair-restore")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Show(ing)? Deleted/ })).toHaveCount(0);
  });

  test("S27: opens a repair's services, a service window with the bleacher card, and the damage report", async ({
    page,
  }) => {
    await readServicesAndReport(page, seeded);
  });

  test("S33: opens the repair window with the vendor, its address, the services and the Total row, and no Files section", async ({
    page,
  }) => {
    await readRepairWindow(page, seeded, { canSeeFiles: false });
  });
});
