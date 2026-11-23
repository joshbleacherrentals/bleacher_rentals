import { test, expect } from "@playwright/test";
import { seedRepairs, type SeededRepairs } from "./helpers/repairsFixtures";
import {
  UPLOAD_TIMEOUT,
  addService,
  chooseBleacher,
  createRepairWithService,
  fillService,
  junctionBleachers,
  junctionCount,
  newRepairWindow,
  newServiceWindow,
  repairIdsOnBleacher,
  reportState,
  serviceCountOnBleacher,
  zoneOfRepair,
} from "./helpers/linksFlow";
import {
  bleacherQuery,
  blockOf,
  cellOf,
  openRepairsPage,
  repairRows,
  rowWith,
  serviceRows,
  toggleOf,
  windowOf,
} from "./helpers/repairsPage";

/**
 * What a service does to the repair around it, as an administrator sees it: the bleachers and the
 * zone of the repair, and the link (and, on a Completed repair, the closing) of the open damage
 * reports of the service's bleacher. Written, not run (project rule); the admin project cannot run
 * locally. Every scenario reads what the page wrote from the database with the service role, and
 * polls, because the page writes locally and the connector uploads.
 * Spec: docs/specs/repairs-09b2-bleachers-zone-reports.md §6 (S34 to S39, D187).
 */
test.describe.configure({ mode: "serial" });

test.describe("Repairs: what a service does to its repair (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  /** The 09b2 fixtures need two zones; without them the scenarios skip themselves. */
  const need = () => {
    test.skip(!seeded.links || !seeded.zones, "the database has fewer than two zones");
    return { links: seeded.links!, zones: seeded.zones! };
  };

  test("S34: a New repair with a service has bleachers and a zone, and its reports are linked", async ({
    page,
  }) => {
    const { links, zones } = need();
    const bleacher = links.newRepairBleacher;

    // The bleacher has no repair yet.
    await openRepairsPage(page, bleacherQuery(bleacher.uuid));
    await expect(page.getByTestId("repairs-empty")).toBeVisible({ timeout: 60_000 });

    await createRepairWithService(page, {
      bleacherNumber: bleacher.number,
      from: "2026-10-20",
      to: "2026-10-25",
    });

    // The row shows the chip of the bleacher and its zone, and the day of the earliest report.
    await expect(repairRows(page)).toHaveCount(1, { timeout: 60_000 });
    const row = repairRows(page).first();
    await expect(cellOf(row, "bleachers")).toContainText(`#${bleacher.number}`);
    await expect(cellOf(row, "zone")).toContainText(zones.a.name);
    await expect(cellOf(row, "reported")).toContainText("2026-10-10");

    // One junction row, the zone of the bleacher, and both open reports linked and still open.
    await expect
      .poll(async () => (await repairIdsOnBleacher(bleacher.uuid)).length, {
        timeout: UPLOAD_TIMEOUT,
      })
      .toBe(1);
    const [repairId] = await repairIdsOnBleacher(bleacher.uuid);
    expect(await junctionCount(repairId, bleacher.uuid)).toBe(1);
    await expect.poll(() => zoneOfRepair(repairId), { timeout: UPLOAD_TIMEOUT }).toBe(zones.a.uuid);
    for (const reportId of bleacher.reportIds) {
      await expect
        .poll(() => reportState(reportId), { timeout: UPLOAD_TIMEOUT })
        .toEqual({ repairId, closed: false });
    }
  });

  test("S35: the first service of an old repair keeps its one row, writes the zone and links a free report only", async ({
    page,
  }) => {
    const { links, zones } = need();
    const old = links.oldRepair;

    await openRepairsPage(page, bleacherQuery(old.bleacher.uuid));
    const row = rowWith(page, old.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.click();
    await expect(toggleOf(row)).toHaveAttribute("aria-expanded", "true");
    await expect(blockOf(row)).toContainText("No services on this repair.");

    // Add service from the open row, on the bleacher the repair already has a row for.
    await blockOf(row).getByTestId("add-service").click();
    await addService(page, old.bleacher.number);
    await expect(newServiceWindow(page)).toHaveCount(0);
    await expect(serviceRows(page)).toHaveCount(1, { timeout: 60_000 });

    // No second row; the zone is written; the free report is linked; the one that belongs to the CAD
    // repair stays with it.
    await expect.poll(() => zoneOfRepair(old.id), { timeout: UPLOAD_TIMEOUT }).toBe(zones.a.uuid);
    expect(await junctionCount(old.id, old.bleacher.uuid)).toBe(1);
    await expect
      .poll(() => reportState(old.freeReportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId: old.id, closed: false });
    expect(await reportState(old.elsewhereReportId)).toEqual({
      repairId: old.elsewhereRepairId,
      closed: false,
    });
    await expect(cellOf(row, "reported")).toContainText("2026-10-02");
  });

  test("S36: moving a service moves the chip and the links, another zone is refused, and deleting the last service takes the chip off and keeps the zone", async ({
    page,
  }) => {
    const { links, zones } = need();
    const move = links.moveRepair;

    await openRepairsPage(page, bleacherQuery([move.from.uuid, move.to.uuid]));
    const row = rowWith(page, move.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(row, "bleachers")).toContainText(`#${move.from.number}`);
    await row.click();
    await serviceRows(page).first().click();
    const service = windowOf(page, "service");
    await expect(service).toBeVisible();

    // Move it to a bleacher of the same zone: the chip follows, the links follow.
    await service.getByTestId("service-edit").click();
    await chooseBleacher(page, service, move.to.number);
    await service.getByTestId("service-save").click();
    await expect(service.getByTestId("service-edit")).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(row, "bleachers")).toContainText(`#${move.to.number}`);
    await expect(cellOf(row, "bleachers")).not.toContainText(`#${move.from.number}`);
    await expect
      .poll(() => junctionBleachers(move.id), { timeout: UPLOAD_TIMEOUT })
      .toEqual([move.to.uuid]);
    await expect
      .poll(() => reportState(move.linkedReportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId: null, closed: false });
    await expect
      .poll(() => reportState(move.freeReportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId: move.id, closed: false });
    expect(await zoneOfRepair(move.id)).toBe(zones.a.uuid);

    // Move it to a bleacher of the other zone: the text under Bleacher, and nothing changes.
    await service.getByTestId("service-edit").click();
    await chooseBleacher(page, service, move.otherZoneBleacher.number);
    await service.getByTestId("service-save").click();
    const error = service.getByTestId("service-error-bleacher");
    await expect(error).toBeVisible();
    await expect(error).toContainText(
      `Bleacher #${move.otherZoneBleacher.number} is in ${zones.b.name}`,
    );
    await expect(error).toContainText(`but this repair is in ${zones.a.name}`);
    await service.getByTestId("service-cancel").click();
    await expect(service.getByTestId("service-edit")).toBeVisible();
    await expect(cellOf(row, "bleachers")).toContainText(`#${move.to.number}`);
    expect(await serviceCountOnBleacher(move.otherZoneBleacher.uuid)).toBe(0);

    // Delete the last service: the repair has no bleacher left, so the Bleacher filter of the address
    // no longer finds it, and the zone stays.
    await service.getByTestId("service-delete").click();
    await page
      .getByTestId("service-delete-dialog")
      .getByRole("button", { name: "Continue" })
      .click();
    await expect(service).toHaveCount(0);
    await expect(row).toHaveCount(0, { timeout: 60_000 });
    await expect.poll(() => junctionBleachers(move.id), { timeout: UPLOAD_TIMEOUT }).toEqual([]);
    expect(await zoneOfRepair(move.id)).toBe(zones.a.uuid);
    await expect
      .poll(() => reportState(move.freeReportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId: null, closed: false });
  });

  test("S37: a service on a Completed repair links and closes the report created before it ended, and leaves the later one open and free", async ({
    page,
  }) => {
    const { links } = need();
    const done = links.completedRepair;

    await openRepairsPage(page, bleacherQuery(done.bleacher.uuid, "&tab=completed"));
    const row = rowWith(page, done.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.click();
    await blockOf(row).getByTestId("add-service").click();
    await addService(page, done.bleacher.number);
    await expect(newServiceWindow(page)).toHaveCount(0);
    await expect(serviceRows(page)).toHaveCount(1, { timeout: 60_000 });

    await expect
      .poll(() => reportState(done.beforeReportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId: done.id, closed: true });
    expect(await reportState(done.afterReportId)).toEqual({ repairId: null, closed: false });
  });

  test("S38: Add service in a New repair draft refuses a bleacher of another zone at once, and accepts one with no zone", async ({
    page,
  }) => {
    const { links, zones } = need();
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid));
    await page.getByTestId("new-repair").click();
    const win = newRepairWindow(page);
    await expect(win).toBeVisible();

    // The first service sets the zone the draft compares with: the zone of bleacher A.
    await win.getByTestId("add-service").click();
    await addService(page, seeded.bleacherA.number);
    await expect(newServiceWindow(page)).toHaveCount(0);

    // A bleacher of the other zone is refused under Bleacher, and the service is not added.
    await win.getByTestId("add-service").click();
    await fillService(page, seeded.bleacherB.number);
    await newServiceWindow(page).getByTestId("service-save").click();
    const error = newServiceWindow(page).getByTestId("service-error-bleacher");
    await expect(error).toBeVisible();
    await expect(error).toContainText(`Bleacher #${seeded.bleacherB.number} is in ${zones.b.name}`);
    await expect(error).toContainText(`but this repair is in ${zones.a.name}`);
    await newServiceWindow(page).getByTestId("service-cancel").click();
    await expect(newServiceWindow(page)).toHaveCount(0);

    // A bleacher with no zone conflicts with nothing and is added.
    await win.getByTestId("add-service").click();
    await addService(page, links.noZoneBleacher.number);
    await expect(newServiceWindow(page)).toHaveCount(0);
    await expect(
      win.getByTestId("repair-window-services").getByTestId("repair-service-row"),
    ).toHaveCount(2);

    // Nothing was written: Cancel drops the draft.
    await win.getByTestId("repair-cancel").click();
    await expect(win).toHaveCount(0);
    expect(await serviceCountOnBleacher(seeded.bleacherB.uuid)).toBe(0);
    expect(await serviceCountOnBleacher(links.noZoneBleacher.uuid)).toBe(0);
  });

  test("S39: a zone conflict that the days make shows as a red line above the services at Save, and writes nothing", async ({
    page,
  }) => {
    const { links, zones } = need();
    const rented = links.subrentalBleacher;
    await openRepairsPage(page, bleacherQuery(rented.uuid));
    await page.getByTestId("new-repair").click();
    const win = newRepairWindow(page);
    await expect(win).toBeVisible();

    // While Repair from is empty only the own zones count, and both bleachers are in the zone of A.
    await win.getByTestId("add-service").click();
    await addService(page, seeded.bleacherA.number);
    await expect(newServiceWindow(page)).toHaveCount(0);
    await win.getByTestId("add-service").click();
    await addService(page, rented.number);
    await expect(newServiceWindow(page)).toHaveCount(0);
    await expect(
      win.getByTestId("repair-window-services").getByTestId("repair-service-row"),
    ).toHaveCount(2);

    // A day inside the sub-rental puts the second bleacher in the other zone.
    await win.locator("#repair-from").fill(links.subrental.day);
    await win.locator("#repair-to").fill("2026-11-05");
    await win.getByTestId("repair-save").click();
    const line = win.getByTestId("repair-services-error");
    await expect(line).toBeVisible();
    await expect(line).toContainText(
      `Bleacher #${rented.number} is in ${zones.b.name} on ${links.subrental.day}, but this repair is in ${zones.a.name}.`,
    );
    await expect(win).toBeVisible();

    // Nothing was written, and the line goes when Repair from changes.
    await page.waitForTimeout(3_000);
    expect(await serviceCountOnBleacher(rented.uuid)).toBe(0);
    await win.locator("#repair-from").fill("2026-11-04");
    await expect(line).toHaveCount(0);
    await win.getByTestId("repair-cancel").click();
    await expect(win).toHaveCount(0);
  });
});
