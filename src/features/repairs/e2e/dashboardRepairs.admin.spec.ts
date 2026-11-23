import { test, expect } from "@playwright/test";
import { seedRepairs, type SeededRepairs } from "./helpers/repairsFixtures";
import {
  CREATE_REPAIR_BUTTON,
  CREATE_REPAIR_HINT,
  REPAIR_DAYS,
  REQUIRE_SERVICE_MESSAGE,
  expectEmptyNewRepairWindow,
  findReportCard,
  openCreateMenu,
  openDashboard,
  openReportCard,
} from "./helpers/dashboardFlow";
import {
  UPLOAD_TIMEOUT,
  addService,
  newRepairWindow,
  newServiceWindow,
  repairIdsOnBleacher,
  reportState,
} from "./helpers/linksFlow";

/**
 * The maintenance flow of the Dashboard and of the Damage Reports page, as an administrator sees it:
 * "+ Create" with two items, "Maintenance Event" opening an empty New repair window, and the button
 * "Create Maintenance to Resolve" of a report (the window it opens, the refusal of a repair with no
 * service, and the link it writes). The grid of the Dashboard is a PixiJS canvas with no click hook, so
 * a bar and the icon of a cell are not driven here. Written, not run (project rule); the admin project
 * cannot run locally. The link of a report is read from the database with the service role, and
 * polled, because the page writes locally and the connector uploads.
 * Spec: docs/specs/repairs-11-dashboard.md §6 (S51 to S53, D228).
 */
test.describe.configure({ mode: "serial" });

test.describe("Dashboard and damage reports: the repair window (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S51: + Create has two items, and Maintenance Event opens an empty New repair window", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await openDashboard(page);

    const items = await openCreateMenu(page);
    await expect(items).toHaveCount(2);
    await expect(page.getByRole("menuitem", { name: "Maintenance Event" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sub-Rental Request" })).toBeVisible();

    await page.getByRole("menuitem", { name: "Maintenance Event" }).click();
    await expect(page.getByRole("menuitem")).toHaveCount(0);
    await expectEmptyNewRepairWindow(page);
  });

  test("S52: Create Maintenance to Resolve opens New repair with the bleacher, refuses no service, and links the report", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { bleacher, reportId, note } = seeded.dashboard.unlinked;

    // The card of an open report that no repair has offers the button, with its hint.
    const card = await findReportCard(page, note);
    const dialog = await openReportCard(page, card);
    await expect(dialog.getByText(CREATE_REPAIR_HINT)).toBeVisible();
    await dialog.getByRole("button", { name: CREATE_REPAIR_BUTTON }).click();

    // The New repair window opens with the service form over it and the report's bleacher chosen.
    const win = newRepairWindow(page);
    const service = newServiceWindow(page);
    await expect(win).toBeVisible();
    await expect(service).toBeVisible();
    await expect(service.locator("#service-bleacher").getByRole("combobox")).toContainText(
      `#${bleacher.number}`,
      { timeout: 60_000 },
    );

    // Cancel on the service form leaves the window with no service.
    await service.getByTestId("service-cancel").click();
    await expect(service).toHaveCount(0);
    await expect(win).toBeVisible();
    await expect(win.getByTestId("repair-services-empty")).toBeVisible();

    // Add repair with the two days and no service is refused with a red line, and writes nothing.
    await win.locator("#repair-from").fill(REPAIR_DAYS.from);
    await win.locator("#repair-to").fill(REPAIR_DAYS.to);
    await win.getByTestId("repair-save").click();
    await expect(win.getByTestId("repair-services-error")).toHaveText(REQUIRE_SERVICE_MESSAGE);
    await expect(win).toBeVisible();

    // A service for the bleacher of the report, then Add repair: the window and the card close.
    await win.getByTestId("add-service").click();
    await addService(page, bleacher.number);
    await expect(service).toHaveCount(0);
    await expect(win.getByTestId("repair-services-error")).toHaveCount(0);
    await win.getByTestId("repair-save").click();
    await expect(win).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Edit Damage Report", { exact: true })).toHaveCount(0);

    // The list shows the report as linked at once (the write is local).
    await expect(card).toContainText("Linked to:", { timeout: 30_000 });

    // The one repair of the bleacher is in the database, and the report carries its id and is open.
    await expect
      .poll(async () => (await repairIdsOnBleacher(bleacher.uuid)).length, {
        timeout: UPLOAD_TIMEOUT,
      })
      .toBe(1);
    const [repairId] = await repairIdsOnBleacher(bleacher.uuid);
    await expect
      .poll(() => reportState(reportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId, closed: false });
  });

  test("S53: the card of a report that is linked to a repair has no Create Maintenance to Resolve", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const { note } = seeded.dashboard.linked;

    const card = await findReportCard(page, note);
    await expect(card).toContainText("Linked to:", { timeout: 60_000 });
    // The card is the manager's one (it has the delete icon), so the missing button is the link's doing.
    await expect(card.getByTitle("Delete damage report")).toBeVisible();

    const dialog = await openReportCard(page, card);
    await expect(dialog.getByRole("button", { name: CREATE_REPAIR_BUTTON })).toHaveCount(0);
    await expect(dialog.getByText(CREATE_REPAIR_HINT)).toHaveCount(0);
  });
});
