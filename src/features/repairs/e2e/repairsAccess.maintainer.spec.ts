import { test, expect } from "@playwright/test";
import { seedRepairs, usd, type SeededRepairs } from "./helpers/repairsFixtures";
import { createRepairWithService } from "./helpers/linksFlow";
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
 * The Repairs page as a maintainer sees it: the whole table, vendors and money included, no Restore
 * and a click on a row that opens its block of services. Written, not run (project rule).
 * Spec: docs/specs/repairs-04-table.md §6 (S10, D52), docs/specs/repairs-05-toolbar.md §6 (S20)
 * docs/specs/repairs-06-expanded-row.md §6 (S27), docs/specs/repairs-07-repair-window.md §6 (S33)
 * and docs/specs/repairs-09b2-bleachers-zone-reports.md §6 (S42).
 */
test.describe("Repairs page (maintainer)", () => {
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

  test("S10: the Show Deleted button is there", async ({ page }) => {
    await openRepairsPage(page);
    await expect(page.getByRole("button", { name: "Show Deleted" })).toHaveCount(1);
  });

  test("S20: the search and the Vendor filter narrow the list, and ?showDeleted=1 shows the deleted repair", async ({
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

    await openRepairsPage(
      page,
      bleacherQuery(seeded.bleacherA.uuid, "&tab=completed&showDeleted=1"),
    );
    await expect(rowWith(page, seeded.deleted.invoice)).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Showing Deleted" })).toBeVisible();
  });

  test("S27: opens a repair's services, a service window with the bleacher card, and the damage report", async ({
    page,
  }) => {
    await readServicesAndReport(page, seeded);
  });

  test("S33: opens the repair window with the vendor, its address, the services and the Total row, and the files", async ({
    page,
  }) => {
    await readRepairWindow(page, seeded, { canSeeFiles: true });
  });

  test("S42: Add service on a bleacher of a New repair shows its chip and its zone", async ({
    page,
  }) => {
    test.skip(!seeded.links || !seeded.zones, "the database has fewer than two zones");
    const bleacher = seeded.links!.newRepairBleacher;
    await openRepairsPage(page, bleacherQuery(bleacher.uuid));
    await expect(page.getByTestId("repairs-empty")).toBeVisible({ timeout: 60_000 });
    await createRepairWithService(page, {
      bleacherNumber: bleacher.number,
      from: "2026-10-20",
      to: "2026-10-25",
    });
    await expect(repairRows(page)).toHaveCount(1, { timeout: 60_000 });
    const row = repairRows(page).first();
    await expect(cellOf(row, "bleachers")).toContainText(`#${bleacher.number}`);
    await expect(cellOf(row, "zone")).toContainText(seeded.zones!.a.name);
  });
});
