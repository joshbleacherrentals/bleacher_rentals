import { test, expect } from "@playwright/test";
import {
  REPORT_DAYS,
  SERVICE_TIRES,
  SERVICE_WELDING,
  seedRepairs,
  usd,
  type SeededRepairs,
} from "./helpers/repairsFixtures";
import {
  bleacherQuery,
  blockOf,
  cellOf,
  openRepairsPage,
  repairRows,
  rowWith,
  searchBox,
  serviceRows,
  sortButton,
  tab,
  toggleOf,
  toggleOption,
  windowOf,
} from "./helpers/repairsPage";

/**
 * The expanded row, the service window and the damage report window as an administrator sees
 * them: all read-only. Written, not run (project rule); the admin project cannot run locally.
 * Spec: docs/specs/repairs-06-expanded-row.md §6 (S21 to S26); S21 and S23 changed by
 * docs/specs/repairs-07-repair-window.md §6 (every row has an open button; Open repair exists).
 */
const sum = (amounts: typeof SERVICE_TIRES) =>
  amounts.labor + amounts.parts + amounts.tax + amounts.freight;

test.describe.configure({ mode: "serial" });

test.describe("Repairs expanded row and windows (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S21: a row, its arrow and a second click open and close the block, which lists the services", async ({
    page,
  }) => {
    // Both bleachers, so that the completed repair and the cheap ones without services are listed.
    await openRepairsPage(
      page,
      bleacherQuery([seeded.bleacherA.uuid, seeded.bleacherB.uuid], "&tab=completed&pageSize=100"),
    );
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "false");

    // A click on the row, then a second click, then the arrow twice.
    await cellOf(done, "vendor").click();
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "true");
    await expect(blockOf(done)).toBeVisible();
    await cellOf(done, "vendor").click();
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "false");
    await expect(serviceRows(page)).toHaveCount(0);
    await toggleOf(done).click();
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "true");
    await toggleOf(done).click();
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "false");

    // Open again: the two services, in the order they were made, with their amounts.
    await toggleOf(done).click();
    const rows = serviceRows(page);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Tires");
    await expect(rows.nth(1)).toContainText("Welding");
    await expect(rows.nth(0)).toContainText(`#${seeded.bleacherA.number}`);
    await expect(cellOf(rows.nth(0), "service-labor")).toHaveText(usd(SERVICE_TIRES.labor));
    await expect(cellOf(rows.nth(0), "service-total")).toHaveText(usd(sum(SERVICE_TIRES)));
    await expect(cellOf(rows.nth(1), "service-freight")).toHaveText(usd(SERVICE_WELDING.freight));
    await expect(cellOf(rows.nth(1), "service-total")).toHaveText(usd(sum(SERVICE_WELDING)));
    await expect(cellOf(rows.nth(0), "service-reported")).toContainText(REPORT_DAYS.first);

    // A second repair opens at the same time (D2); one of the cheap ones has no services.
    const cheap = repairRows(page).filter({ hasNotText: seeded.completed.invoice }).first();
    await toggleOf(cheap).click();
    await expect(toggleOf(cheap)).toHaveAttribute("aria-expanded", "true");
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("repair-services-empty")).toBeVisible();
    await expect(page.getByText("No services on this repair.")).toBeVisible();

    // Nothing that writes is drawn (D84). Every row has its open button (spec 07 D94).
    await expect(page.getByRole("button", { name: /Add service|^Edit|^Delete/ })).toHaveCount(0);
  });

  test("S22: every change of the list closes the open repairs", async ({ page }) => {
    const base = bleacherQuery(seeded.bleacherA.uuid, "&tab=completed");
    await openRepairsPage(page, base);
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    const open = async () => {
      if ((await toggleOf(done).getAttribute("aria-expanded")) !== "true") {
        await toggleOf(done).click();
      }
      await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "true");
    };

    // The other tab, and back: the repair is closed.
    await open();
    await tab(page, "Open").click();
    await tab(page, "Completed").click();
    await expect(toggleOf(rowWith(page, seeded.completed.invoice))).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // The page size.
    await open();
    await page.getByLabel("Rows per page").selectOption("50");
    await expect(toggleOf(rowWith(page, seeded.completed.invoice))).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // A search text (the repair still matches).
    await open();
    await searchBox(page).fill(seeded.completed.invoice);
    await expect(page).toHaveURL(/q=/);
    await expect(toggleOf(rowWith(page, seeded.completed.invoice))).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await searchBox(page).fill("");

    // A filter.
    await open();
    await toggleOption(page, "vendor", seeded.vendorName);
    await expect(toggleOf(rowWith(page, seeded.completed.invoice))).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // A sort click.
    await open();
    await sortButton(page, "Total").click();
    await expect(page).toHaveURL(/sort=total/);
    await expect(toggleOf(rowWith(page, seeded.completed.invoice))).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    // Show Deleted, and back.
    await open();
    await page.getByRole("button", { name: "Show Deleted" }).click();
    await page.getByRole("button", { name: "Showing Deleted" }).click();
    await expect(toggleOf(rowWith(page, seeded.completed.invoice))).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("S23: a service row opens the service window, which is read-only and closes three ways", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await toggleOf(done).click();

    const openTires = async () => {
      await serviceRows(page).filter({ hasText: "Tires" }).click();
      await expect(windowOf(page, "service")).toBeVisible();
    };
    await openTires();
    const win = windowOf(page, "service");
    await expect(
      win.getByRole("heading", { name: `Tires · Bleacher #${seeded.bleacherA.number}` }),
    ).toBeVisible();

    // The repair strip: vendor, invoice number, status and currency.
    const strip = win.getByTestId("service-window-repair");
    await expect(strip).toContainText(seeded.vendorName);
    await expect(strip).toContainText(seeded.completed.invoice);
    await expect(strip).toContainText("Completed");
    await expect(strip).toContainText("USD");

    // The fields and the amounts of that service.
    await expect(win).toContainText("Minor");
    await expect(win.locator('[data-amount="labor"]')).toContainText(usd(SERVICE_TIRES.labor));
    await expect(win.locator('[data-amount="total"]')).toContainText(usd(sum(SERVICE_TIRES)));

    // The bleacher card.
    const card = win.getByTestId("service-window-bleacher");
    await expect(card).toContainText(`#${seeded.bleacherA.number}`);
    await expect(card).toContainText(seeded.bleacherA.modelNumber);
    if (seeded.bleacherA.typeName) await expect(card).toContainText(seeded.bleacherA.typeName);
    if (seeded.zones) await expect(card).toContainText(seeded.zones.a.name);

    // Nothing that writes (D84): the cross, the report button and, opened from the table, Open
    // repair (spec 07 D98).
    await expect(win.getByRole("button", { name: /Edit|Delete|Add service/ })).toHaveCount(0);
    await expect(win.getByTestId("service-window-open-repair")).toBeVisible();
    await expect(win.getByRole("button", { name: "Close" })).toBeVisible();

    // Esc, the cross and a click on the dimmed page each close it; the row stays open.
    await page.keyboard.press("Escape");
    await expect(win).toHaveCount(0);
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "true");
    await openTires();
    await windowOf(page, "service").getByRole("button", { name: "Close" }).click();
    await expect(windowOf(page, "service")).toHaveCount(0);
    await openTires();
    await page.mouse.click(5, 5);
    await expect(windowOf(page, "service")).toHaveCount(0);
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "true");
  });

  test("S24: the Reported day of a row opens the damage reports of the repair", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });

    await cellOf(done, "reported").getByTestId("repair-reported-link").click();
    const win = windowOf(page, "reports");
    await expect(win).toBeVisible();
    await expect(win.getByRole("heading", { name: "Damage reports (2)" })).toBeVisible();
    // The row did not toggle.
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "false");

    // Two cards, the earlier day first, each with the note, the levels and the resolve.
    const cards = win.getByTestId("damage-report-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toContainText(`Reported ${REPORT_DAYS.first}`);
    await expect(cards.nth(1)).toContainText(`Reported ${REPORT_DAYS.second}`);
    for (const index of [0, 1]) {
      await expect(cards.nth(index)).toContainText(seeded.reportNote);
      await expect(cards.nth(index)).toContainText("Seat: minor");
      await expect(cards.nth(index)).toContainText("Haul: none");
      await expect(cards.nth(index)).toContainText("Resolved");
    }
    // The photo of the first report is a link to its path, in a new tab.
    const photo = cards.nth(0).locator(`a[href*="${seeded.photoPath}"]`);
    await expect(photo).toHaveAttribute("target", "_blank");
    await expect(cards.nth(1).locator("a")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(win).toHaveCount(0);

    // The CAD repair has one report, so the window says Damage report.
    await tab(page, "Open").click();
    const inRepair = rowWith(page, "In repair");
    await expect(inRepair).toBeVisible({ timeout: 60_000 });
    await cellOf(inRepair, "reported").getByTestId("repair-reported-link").click();
    await expect(
      windowOf(page, "reports").getByRole("heading", { name: "Damage report" }),
    ).toBeVisible();
    await expect(windowOf(page, "reports").getByTestId("damage-report-card")).toHaveCount(1);
  });

  test("S25: View Damage Report in the service window opens the reports over it", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await toggleOf(done).click();
    await serviceRows(page).filter({ hasText: "Tires" }).click();

    const service = windowOf(page, "service");
    const button = service.getByTestId("service-window-reports");
    await expect(button).toHaveText("View Damage Reports (2)");
    await button.click();
    const reports = windowOf(page, "reports");
    await expect(reports).toBeVisible();
    await expect(reports.getByTestId("damage-report-card")).toHaveCount(2);

    // Esc closes only the window on top.
    await page.keyboard.press("Escape");
    await expect(reports).toHaveCount(0);
    await expect(service).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(service).toHaveCount(0);

    // The CAD repair's service has one report.
    await tab(page, "Open").click();
    const inRepair = rowWith(page, "In repair");
    await expect(inRepair).toBeVisible({ timeout: 60_000 });
    await toggleOf(inRepair).click();
    await serviceRows(page).first().click();
    await expect(windowOf(page, "service").getByTestId("service-window-reports")).toHaveText(
      "View Damage Report",
    );
  });

  test("S26: in Show Deleted a service deleted on its own is marked, and Restore does not open the row", async ({
    page,
  }) => {
    await openRepairsPage(
      page,
      bleacherQuery(seeded.bleacherA.uuid, "&tab=completed&showDeleted=1"),
    );
    const row = rowWith(page, seeded.deletedServices.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await cellOf(row, "vendor").click();
    await expect(serviceRows(page)).toHaveCount(2);

    const removed = serviceRows(page).filter({ hasText: seeded.deletedServices.removedCategory });
    const live = serviceRows(page).filter({ hasText: seeded.deletedServices.liveCategory });
    await expect(removed).toContainText("Deleted");
    await expect(live).not.toContainText("Deleted");

    // The mark is in the window of the deleted service too, and not in the other one's.
    await removed.click();
    await expect(windowOf(page, "service")).toContainText("Deleted");
    await page.keyboard.press("Escape");
    await live.click();
    await expect(windowOf(page, "service")).not.toContainText("Deleted");
    await page.keyboard.press("Escape");

    // Restore brings the other deleted repair back and does not touch the open block.
    const other = rowWith(page, seeded.deleted.invoice);
    await expect(other).toBeVisible();
    await other.getByTestId("repair-restore").click();
    await expect(other).toHaveCount(0, { timeout: 30_000 });
    await expect(serviceRows(page)).toHaveCount(2);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
