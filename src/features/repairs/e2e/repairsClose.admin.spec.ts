import { test, expect } from "@playwright/test";
import { seedRepairs, type SeededRepairs } from "./helpers/repairsFixtures";
import {
  UPLOAD_TIMEOUT,
  addService,
  cancelClose,
  chooseFormStatus,
  chooseRowStatus,
  closeDialogGroup,
  closeDialogReportIds,
  confirmClose,
  expectNoCloseDialog,
  newRepairWindow,
  newServiceWindow,
  repairIdsOnBleacher,
  repairStatusRow,
  reportRow,
  reportState,
  sameMoment,
  setCloseSwitch,
} from "./helpers/linksFlow";
import {
  bleacherQuery,
  cellOf,
  openButtonOf,
  openRepairsPage,
  rowWith,
  tab,
  windowOf,
} from "./helpers/repairsPage";

/**
 * The dialog that asks which damage reports to close when a repair is Completed, as an administrator
 * sees it: the status menu of a row, Cancel, a repair with nothing linked, the Status select of Edit
 * (asked after Save, once the form is valid), and New repair saved as Completed. Written, not run
 * (project rule); the admin project cannot run locally. Every scenario reads the repair and its
 * damage reports from the database with the service role, and polls, because the page writes locally
 * and the connector uploads. S37 (a service on a Completed repair) is in repairsLinks.admin.spec.ts.
 * Spec: docs/specs/repairs-08a-choose-reports-to-close.md §6 (S58 to S62, D251).
 */
test.describe.configure({ mode: "serial" });

test.describe("Repairs: which damage reports to close (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S58: the status menu into Completed lists the two linked reports; a switch off keeps one open and unlinked, Confirm closes the other with the moment of completion", async ({
    page,
  }) => {
    const repair = seeded.close.linked;
    const [closed, kept] = repair.reportIds;

    await openRepairsPage(page, bleacherQuery(repair.bleacher.uuid));
    const row = rowWith(page, repair.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(row, "status")).toContainText("In repair");

    await chooseRowStatus(page, row, "completed");

    // Both reports are offered, in the section of the reports linked to the repair, every switch on.
    expect(await closeDialogReportIds(page)).toEqual([closed, kept].sort());
    expect(await closeDialogGroup(page, "linked")).toEqual([closed, kept].sort());
    expect(await closeDialogGroup(page, "free")).toEqual([]);
    for (const id of [closed, kept]) await setCloseSwitch(page, id, true); // they start on (D242)

    // Nothing is written before Confirm: the pill still says In repair.
    await expect(cellOf(row, "status")).toContainText("In repair");

    await setCloseSwitch(page, kept, false);
    await confirmClose(page);

    // The row leaves the Open tab at once.
    await expect(rowWith(page, repair.invoice)).toHaveCount(0, { timeout: 60_000 });

    await expect
      .poll(async () => (await repairStatusRow(repair.id)).status, { timeout: UPLOAD_TIMEOUT })
      .toBe("completed");
    const completedAt = (await repairStatusRow(repair.id)).completedAt;
    expect(completedAt).not.toBeNull();

    // The report with its switch on is closed with the same moment and keeps its link.
    await expect
      .poll(async () => (await reportRow(closed)).resolvedAt !== null, { timeout: UPLOAD_TIMEOUT })
      .toBe(true);
    const closedRow = await reportRow(closed);
    expect(closedRow.repairId).toBe(repair.id);
    expect(sameMoment(closedRow.resolvedAt, completedAt)).toBe(true);

    // The one with its switch off stays open and loses the link.
    await expect
      .poll(() => reportState(kept), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId: null, closed: false });
  });

  test("S59: Cancel in the dialog writes nothing: the status, completed_at and both reports are as before", async ({
    page,
  }) => {
    const repair = seeded.close.cancel;

    await openRepairsPage(page, bleacherQuery(repair.bleacher.uuid));
    const row = rowWith(page, repair.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });

    await chooseRowStatus(page, row, "completed");
    expect(await closeDialogReportIds(page)).toEqual([...repair.reportIds].sort());
    await cancelClose(page);

    // The row is still on the Open tab with its old status.
    await expect(rowWith(page, repair.invoice)).toBeVisible();
    await expect(cellOf(rowWith(page, repair.invoice), "status")).toContainText("In repair");

    // Time for an upload to show, if there had been one; then the database is as it was.
    await page.waitForTimeout(3_000);
    expect(await repairStatusRow(repair.id)).toEqual({ status: "in_repair", completedAt: null });
    for (const id of repair.reportIds) {
      expect(await reportState(id)).toEqual({ repairId: repair.id, closed: false });
    }
  });

  test("S60: a repair with no open linked report goes to Completed with no dialog, and back out of Completed raises none", async ({
    page,
  }) => {
    const repair = seeded.close.plain;

    await openRepairsPage(page, bleacherQuery(repair.bleacher.uuid));
    const row = rowWith(page, repair.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });

    // Into Completed: written at once. The free open report on its bleacher is not offered.
    await chooseRowStatus(page, row, "completed");
    await expect(rowWith(page, repair.invoice)).toHaveCount(0, { timeout: 60_000 });
    await expectNoCloseDialog(page);
    await expect
      .poll(async () => (await repairStatusRow(repair.id)).status, { timeout: UPLOAD_TIMEOUT })
      .toBe("completed");
    expect((await repairStatusRow(repair.id)).completedAt).not.toBeNull();
    expect(await reportState(repair.freeReportId)).toEqual({ repairId: null, closed: false });

    // Out of Completed: no dialog either, and completed_at is cleared.
    await tab(page, "Completed").click();
    const done = rowWith(page, repair.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await chooseRowStatus(page, done, "in_repair");
    await expect(rowWith(page, repair.invoice)).toHaveCount(0, { timeout: 60_000 });
    await expectNoCloseDialog(page);
    await expect
      .poll(() => repairStatusRow(repair.id), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ status: "in_repair", completedAt: null });
    expect(await reportState(repair.freeReportId)).toEqual({ repairId: null, closed: false });
  });

  test("S61: Edit with Status Completed asks only after Save, once the form is valid; Confirm closes the report", async ({
    page,
  }) => {
    const repair = seeded.close.edit;
    const [reportId] = repair.reportIds;

    await openRepairsPage(page, bleacherQuery(repair.bleacher.uuid));
    const row = rowWith(page, repair.invoice);
    await expect(row).toBeVisible({ timeout: 60_000 });
    await openButtonOf(row).click();
    const win = windowOf(page, "repair");
    await expect(win).toBeVisible();
    await win.getByTestId("repair-edit").click();
    await expect(win.getByTestId("repair-save")).toBeVisible();

    // Choosing Completed asks nothing yet, and a form with an error asks nothing at Save.
    await chooseFormStatus(page, win, "Completed");
    await expectNoCloseDialog(page);
    await win.locator("#repair-to").fill("");
    await win.getByTestId("repair-save").click();
    await expect(win.getByTestId("repair-error-to")).toContainText("Repair to is required.");
    await expectNoCloseDialog(page);
    expect(await repairStatusRow(repair.id)).toEqual({ status: "inbound", completedAt: null });

    // With the day back, Save opens the dialog with the one linked report.
    await win.locator("#repair-to").fill("2026-10-25");
    await win.getByTestId("repair-save").click();
    expect(await closeDialogReportIds(page)).toEqual([reportId]);
    expect(await closeDialogGroup(page, "linked")).toEqual([reportId]);
    await confirmClose(page);

    // The window goes back to the view mode, and the repair and the report are written.
    await expect(win.getByTestId("repair-edit")).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => (await repairStatusRow(repair.id)).status, { timeout: UPLOAD_TIMEOUT })
      .toBe("completed");
    await expect
      .poll(() => reportState(reportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId: repair.id, closed: true });
  });

  test("S62: New repair saved as Completed, with a service on a bleacher that has an old open report, lists it; Confirm links and closes it", async ({
    page,
  }) => {
    const { bleacher, reportId } = seeded.close.newRepair;

    await openRepairsPage(page, bleacherQuery(bleacher.uuid, "&tab=completed"));
    await page.getByTestId("new-repair").click();
    const win = newRepairWindow(page);
    await expect(win).toBeVisible();
    await win.locator("#repair-from").fill("2026-10-20");
    await win.locator("#repair-to").fill("2026-10-25");
    await chooseFormStatus(page, win, "Completed");
    await win.getByTestId("add-service").click();
    await addService(page, bleacher.number);
    await expect(newServiceWindow(page)).toHaveCount(0);
    await win.getByTestId("repair-save").click();

    // The report was created on 2026-10-10, before Repair to, and no repair has it: it is offered in
    // the section of the added bleachers.
    expect(await closeDialogReportIds(page)).toEqual([reportId]);
    expect(await closeDialogGroup(page, "free")).toEqual([reportId]);
    expect(await closeDialogGroup(page, "linked")).toEqual([]);
    await confirmClose(page);
    await expect(win).toHaveCount(0, { timeout: 60_000 });

    await expect
      .poll(async () => (await repairIdsOnBleacher(bleacher.uuid)).length, {
        timeout: UPLOAD_TIMEOUT,
      })
      .toBe(1);
    const [repairId] = await repairIdsOnBleacher(bleacher.uuid);
    await expect
      .poll(async () => (await repairStatusRow(repairId)).status, { timeout: UPLOAD_TIMEOUT })
      .toBe("completed");
    await expect
      .poll(() => reportState(reportId), { timeout: UPLOAD_TIMEOUT })
      .toEqual({ repairId, closed: true });
  });
});
