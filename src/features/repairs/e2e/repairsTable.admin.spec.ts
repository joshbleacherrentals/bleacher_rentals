import { test, expect } from "@playwright/test";
import {
  PAGER_REPAIRS,
  REPORT_DAYS,
  SERVICE_CAD,
  SERVICE_TIRES,
  SERVICE_WELDING,
  cad,
  seedRepairs,
  usd,
  type SeededRepairs,
} from "./helpers/repairsFixtures";
import {
  bleacherQuery,
  cellOf,
  columnHeader,
  openRepairsPage,
  repairRows,
  rowWith,
  tab,
  toggleOption,
} from "./helpers/repairsPage";

/**
 * The Repairs table as an administrator sees it: tabs, columns, strip, pager, Bleacher select,
 * Show Deleted and Restore. Written, not run (project rule); the admin project cannot run locally.
 * Spec: docs/specs/repairs-04-table.md §6 (S1 to S9; S1 and S6 changed by
 * docs/specs/repairs-05-toolbar.md §6).
 */
const HEADERS = [
  "Bleachers",
  "Reported",
  "Repair from",
  "Repair to",
  "Zone",
  "Severity",
  "Categories",
  "Notes",
  "Status",
  "Vendor",
  "Invoice #",
  "Labor",
  "Parts",
  "Tax",
  "Freight",
  "Total",
  "Completed",
];

const sum = (key: "labor" | "parts" | "tax" | "freight", ...parts: (typeof SERVICE_TIRES)[]) =>
  parts.reduce((total, p) => total + p[key], 0);

test.describe.configure({ mode: "serial" });

test.describe("Repairs table (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S1: the page opens with the tabs, the strip and the 17 headers", async ({ page }) => {
    await openRepairsPage(page);

    await expect(tab(page, "Open")).toBeVisible();
    await expect(tab(page, "Completed")).toBeVisible();
    await expect(page.getByText("Total cost · CAD")).toBeVisible();
    await expect(page.getByText("Total cost · USD")).toBeVisible();
    await expect(page.getByRole("columnheader")).toHaveText(HEADERS);
    await expect(page.getByRole("button", { name: "New repair" })).toHaveCount(0);
    // Spec 05: the fourteen columns with one value per row sort; the other three do not.
    await expect(page.getByRole("columnheader").getByRole("button")).toHaveCount(14);
    for (const plain of ["Bleachers", "Severity", "Categories"]) {
      await expect(columnHeader(page, plain).getByRole("button")).toHaveCount(0);
    }
  });

  test("S2: Open and Completed hold different repairs, and the tab lives in the URL", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid));
    await expect(rowWith(page, "In repair")).toHaveCount(1, { timeout: 60_000 });
    await expect(rowWith(page, seeded.completed.invoice)).toHaveCount(0);

    await tab(page, "Completed").click();
    await expect(page).toHaveURL(/tab=completed/);
    await expect(rowWith(page, seeded.completed.invoice)).toHaveCount(1);
    await expect(rowWith(page, "In repair")).toHaveCount(0);

    await page.reload();
    await expect(tab(page, "Completed")).toHaveAttribute("aria-selected", "true");

    await tab(page, "Open").click();
    await expect(page).not.toHaveURL(/tab=/);
    await expect(tab(page, "Open")).toHaveAttribute("aria-selected", "true");
  });

  test("S3: the cells of a completed USD repair and of an in-repair CAD repair", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(done, "vendor")).toHaveText(seeded.vendorName);
    await expect(cellOf(done, "invoice")).toHaveText(seeded.completed.invoice);
    await expect(cellOf(done, "status")).toHaveText("Completed");
    await expect(cellOf(done, "total")).toHaveText(usd(seeded.completed.totalCents));
    await expect(cellOf(done, "completed")).toHaveText("2026-09-29");

    await tab(page, "Open").click();
    const open = rowWith(page, "In repair");
    await expect(open).toBeVisible();
    await expect(cellOf(open, "parts")).toHaveText(cad(SERVICE_CAD.parts));
    await expect(cellOf(open, "total")).toHaveText(cad(seeded.cad.totalCents));
    await expect(cellOf(open, "vendor")).toHaveText("—");
    await expect(cellOf(open, "invoice")).toHaveText("—");
    await expect(cellOf(open, "completed")).toHaveText("—");
  });

  test("S4: the strip adds up the tab, per currency, for the chosen bleacher", async ({ page }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid));
    await expect(rowWith(page, "In repair")).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId("repairs-strip-cad")).toHaveText(cad(seeded.cad.totalCents));
    await expect(page.getByTestId("repairs-strip-usd")).toHaveText("$0.00");

    await tab(page, "Completed").click();
    await expect(page.getByTestId("repairs-strip-usd")).toHaveText(
      usd(seeded.completed.totalCents),
    );
    await expect(page.getByTestId("repairs-strip-cad")).toHaveText("C$0.00");
  });

  test("S5: the pager shows 25 rows, then 1, and keeps page and size in the URL", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherB.uuid, "&tab=completed"));
    await expect(repairRows(page)).toHaveCount(25, { timeout: 60_000 });
    await expect(page.getByRole("navigation", { name: "Pagination" })).toContainText(
      `1–25 of ${PAGER_REPAIRS}`,
    );

    await page.getByRole("button", { name: "Go to page 2" }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(repairRows(page)).toHaveCount(PAGER_REPAIRS - 25);

    await page.getByLabel("Rows per page").selectOption("50");
    await expect(page).toHaveURL(/pageSize=50/);
    await expect(page).not.toHaveURL(/page=2/);
    await expect(repairRows(page)).toHaveCount(PAGER_REPAIRS);

    // A page past the end shows the last page.
    await openRepairsPage(page, bleacherQuery(seeded.bleacherB.uuid, "&tab=completed&page=99"));
    await expect(repairRows(page)).toHaveCount(PAGER_REPAIRS - 25, { timeout: 60_000 });
  });

  test("S6: the Bleacher filter narrows the list and the empty state reads No repairs found.", async ({
    page,
  }) => {
    await openRepairsPage(page, "?tab=completed");
    await toggleOption(page, "bleacher", `#${seeded.bleacherA.number}`);
    await expect(page).toHaveURL(new RegExp(`bleachers=${seeded.bleacherA.uuid}`));
    await expect(rowWith(page, seeded.completed.invoice)).toHaveCount(1, { timeout: 60_000 });

    await toggleOption(page, "bleacher", `#${seeded.bleacherA.number}`);
    await toggleOption(page, "bleacher", `#${seeded.emptyBleacher.number}`);
    await expect(page.getByTestId("repairs-empty")).toContainText("No repairs found.");
  });

  test("S7: Show Deleted lists the deleted repair on Completed, and Restore brings it back", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    await expect(rowWith(page, seeded.completed.invoice)).toHaveCount(1, { timeout: 60_000 });
    await expect(rowWith(page, seeded.deleted.invoice)).toHaveCount(0);

    await page.getByRole("button", { name: "Show Deleted" }).click();
    const deleted = rowWith(page, seeded.deleted.invoice);
    await expect(deleted).toHaveCount(1, { timeout: 60_000 });

    await deleted.getByTestId("repair-restore").click();
    await expect(deleted).toHaveCount(0, { timeout: 30_000 });

    await page.getByRole("button", { name: "Showing Deleted" }).click();
    await expect(rowWith(page, seeded.deleted.invoice)).toHaveCount(1, { timeout: 30_000 });
  });

  test("S8: Reported is the day of the linked report as text, with +N for the others", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(done, "reported")).toHaveText(`${REPORT_DAYS.first}+1`);
    await expect(cellOf(done, "reported").locator("a")).toHaveCount(0);

    await tab(page, "Open").click();
    await expect(cellOf(rowWith(page, "In repair"), "reported")).toHaveText(REPORT_DAYS.cad);
  });

  test("S9: a repair with two services shows chips and the sums of its services", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(done, "categories")).toHaveText("TiresWelding");
    await expect(cellOf(done, "severity")).toHaveText("MajorMinor");
    await expect(cellOf(done, "labor")).toHaveText(
      usd(sum("labor", SERVICE_TIRES, SERVICE_WELDING)),
    );
    await expect(cellOf(done, "parts")).toHaveText(
      usd(sum("parts", SERVICE_TIRES, SERVICE_WELDING)),
    );
    await expect(cellOf(done, "tax")).toHaveText(usd(sum("tax", SERVICE_TIRES, SERVICE_WELDING)));
    await expect(cellOf(done, "freight")).toHaveText(
      usd(sum("freight", SERVICE_TIRES, SERVICE_WELDING)),
    );
  });
});
