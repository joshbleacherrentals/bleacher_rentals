import { expect, type Locator, type Page } from "@playwright/test";
import { serviceRoleClient, type SeededRepairs } from "./repairsFixtures";
import {
  bleacherQuery,
  blockOf,
  cellOf,
  openButtonOf,
  openRepairsPage,
  rowWith,
  windowOf,
} from "./repairsPage";

/**
 * What the 09b2 scenarios (S34 to S42) do on the page and read from the database: add a service
 * from the New service window, make a repair with one service, and read the junction, the zone and
 * the damage reports with the service role. The page writes locally and the connector uploads, so
 * every read of the database polls. docs/specs/repairs-09b2-bleachers-zone-reports.md §6.
 * It also holds what the 08a scenarios (S37, S58 to S62) do with the dialog that asks which damage
 * reports to close, and a read of a repair's status. docs/specs/repairs-08a-choose-reports-to-close.md §6.
 */

/** The upload of a local write can take a while; the database is read until it shows it. */
export const UPLOAD_TIMEOUT = 60_000;

export const newServiceWindow = (page: Page) => page.getByTestId("new-service-window");
export const newRepairWindow = (page: Page) => page.getByTestId("new-repair-window");

/**
 * Picks a bleacher in the Bleacher select of a service window (`SearchableSelect`: a combobox
 * button, and a list in a portal with a search box). The options are labelled `#52`.
 */
export async function chooseBleacher(page: Page, scope: Locator, number: number) {
  await scope.locator("#service-bleacher").getByRole("combobox").click();
  await page.getByPlaceholder("Search bleachers...").fill(String(number));
  await page.getByRole("option", { name: `#${number}`, exact: true }).click();
}

/**
 * Picks a severity in the Severity select (`Dropdown`: a button, and a list portaled to the body,
 * whose rows choose on pointer down).
 */
export async function chooseSeverity(page: Page, scope: Locator, label = "Minor") {
  await scope.locator("#service-severity").getByRole("button").click();
  await page
    .locator("body > ul > li")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
}

/** Fills the New service window with a bleacher and a severity (the only required fields) and adds it. */
export async function addService(page: Page, number: number) {
  const win = newServiceWindow(page);
  await expect(win).toBeVisible();
  await chooseBleacher(page, win, number);
  await chooseSeverity(page, win);
  await win.getByTestId("service-save").click();
}

/** The same, up to the click on Add service, so that a scenario can look at a refusal. */
export async function fillService(page: Page, number: number) {
  const win = newServiceWindow(page);
  await expect(win).toBeVisible();
  await chooseBleacher(page, win, number);
  await chooseSeverity(page, win);
}

/** Opens New repair, types the two days and adds one service on a bleacher, then adds the repair. */
export async function createRepairWithService(
  page: Page,
  options: { bleacherNumber: number; from: string; to: string },
) {
  await page.getByTestId("new-repair").click();
  const win = newRepairWindow(page);
  await expect(win).toBeVisible();
  await win.locator("#repair-from").fill(options.from);
  await win.locator("#repair-to").fill(options.to);
  await win.getByTestId("add-service").click();
  await addService(page, options.bleacherNumber);
  await expect(newServiceWindow(page)).toHaveCount(0);
  await win.getByTestId("repair-save").click();
  await expect(win).toHaveCount(0);
}

/** The repair ids that have a junction row on a bleacher, read with the service role. */
export async function repairIdsOnBleacher(bleacherUuid: string): Promise<string[]> {
  const res = await serviceRoleClient()
    .from("BleacherMaintEvents")
    .select("maintenance_event_uuid")
    .eq("bleacher_uuid", bleacherUuid);
  if (res.error) throw new Error(`junction read failed: ${res.error.message}`);
  return (res.data ?? []).map((row) => row.maintenance_event_uuid as string);
}

/** How many junction rows a repair has for a bleacher (a duplicate would show as more than one). */
export async function junctionCount(repairId: string, bleacherUuid: string): Promise<number> {
  const res = await serviceRoleClient()
    .from("BleacherMaintEvents")
    .select("id")
    .eq("maintenance_event_uuid", repairId)
    .eq("bleacher_uuid", bleacherUuid);
  if (res.error) throw new Error(`junction read failed: ${res.error.message}`);
  return res.data?.length ?? 0;
}

/** The bleachers a repair has a junction row for, sorted. */
export async function junctionBleachers(repairId: string): Promise<string[]> {
  const res = await serviceRoleClient()
    .from("BleacherMaintEvents")
    .select("bleacher_uuid")
    .eq("maintenance_event_uuid", repairId);
  if (res.error) throw new Error(`junction read failed: ${res.error.message}`);
  return (res.data ?? []).map((row) => row.bleacher_uuid as string).sort();
}

export async function zoneOfRepair(repairId: string): Promise<string | null> {
  const res = await serviceRoleClient()
    .from("MaintenanceEvents")
    .select("zone_uuid")
    .eq("id", repairId)
    .single();
  if (res.error) throw new Error(`repair read failed: ${res.error.message}`);
  return (res.data?.zone_uuid as string | null) ?? null;
}

/** The link and the closing of one damage report: `{ repairId, closed }`. */
export async function reportState(reportId: string): Promise<{
  repairId: string | null;
  closed: boolean;
}> {
  const res = await serviceRoleClient()
    .from("DamageReports")
    .select("maintenance_event_uuid, resolved_at")
    .eq("id", reportId)
    .single();
  if (res.error) throw new Error(`report read failed: ${res.error.message}`);
  return {
    repairId: (res.data?.maintenance_event_uuid as string | null) ?? null,
    closed: res.data?.resolved_at !== null,
  };
}

/**
 * The same, with the moment of the closing: `{ repairId, resolvedAt }` (`resolvedAt` is null while the
 * report is open). S58 compares it with `completed_at` of the repair.
 */
export async function reportRow(reportId: string): Promise<{
  repairId: string | null;
  resolvedAt: string | null;
}> {
  const res = await serviceRoleClient()
    .from("DamageReports")
    .select("maintenance_event_uuid, resolved_at")
    .eq("id", reportId)
    .single();
  if (res.error) throw new Error(`report read failed: ${res.error.message}`);
  return {
    repairId: (res.data?.maintenance_event_uuid as string | null) ?? null,
    resolvedAt: (res.data?.resolved_at as string | null) ?? null,
  };
}

/** The status and the completion moment of a repair, read with the service role. */
export async function repairStatusRow(repairId: string): Promise<{
  status: string | null;
  completedAt: string | null;
}> {
  const res = await serviceRoleClient()
    .from("MaintenanceEvents")
    .select("status, completed_at")
    .eq("id", repairId)
    .single();
  if (res.error) throw new Error(`repair read failed: ${res.error.message}`);
  return {
    status: (res.data?.status as string | null) ?? null,
    completedAt: (res.data?.completed_at as string | null) ?? null,
  };
}

/** True when two timestamps from the database name the same moment (the text may differ in form). */
export const sameMoment = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime();

/** How many services of any repair exist on a bleacher (the refusals of D176 write none). */
export async function serviceCountOnBleacher(bleacherUuid: string): Promise<number> {
  const res = await serviceRoleClient()
    .from("MaintenanceLineItems")
    .select("id")
    .eq("bleacher_uuid", bleacherUuid);
  if (res.error) throw new Error(`services read failed: ${res.error.message}`);
  return res.data?.length ?? 0;
}

/**
 * What the account manager, the viewer and the maintainer can read of a repair made by services:
 * its bleacher chip and its zone in the row, and no Add service in the open row or in the window.
 * Shared by scenarios S40 and S41. docs/specs/repairs-09b2-bleachers-zone-reports.md §6.
 */
export async function readRepairMadeByServices(page: Page, seeded: SeededRepairs) {
  const links = seeded.links;
  if (!links || !seeded.zones) throw new Error("this scenario needs two zones");
  const { moveRepair } = links;

  await openRepairsPage(page, bleacherQuery(moveRepair.from.uuid));
  const row = rowWith(page, moveRepair.invoice);
  await expect(row).toBeVisible({ timeout: 60_000 });
  await expect(cellOf(row, "bleachers")).toContainText(`#${moveRepair.from.number}`);
  await expect(cellOf(row, "zone")).toContainText(seeded.zones.a.name);

  // The open row has its services and no Add service.
  await row.click();
  await expect(blockOf(row)).toBeVisible();
  await expect(blockOf(row).getByTestId("add-service")).toHaveCount(0);

  // Neither has the repair window.
  await openButtonOf(row).click();
  const win = windowOf(page, "repair");
  await expect(win).toBeVisible();
  await expect(win.getByTestId("add-service")).toHaveCount(0);
}

// ── The dialog that asks which damage reports to close (spec 08a) ──────────────────────────────────

export const closeDialog = (page: Page) => page.getByTestId("close-reports-dialog");
export const closeRows = (page: Page) => closeDialog(page).getByTestId("close-report-row");

/** The ids of the reports the dialog lists, sorted; waits until the dialog is on the page. */
export async function closeDialogReportIds(page: Page): Promise<string[]> {
  await expect(closeDialog(page)).toBeVisible({ timeout: 60_000 });
  const ids = await closeRows(page).evaluateAll((rows) =>
    rows.map((row) => row.getAttribute("data-report-id") ?? ""),
  );
  return ids.sort();
}

/** The ids of the rows of one section (`linked` or `free`), sorted. */
export async function closeDialogGroup(page: Page, group: "linked" | "free"): Promise<string[]> {
  await expect(closeDialog(page)).toBeVisible({ timeout: 60_000 });
  const ids = await closeDialog(page)
    .locator(`[data-testid="close-report-row"][data-group="${group}"]`)
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-report-id") ?? ""));
  return ids.sort();
}

export const closeSwitch = (page: Page, reportId: string) =>
  closeDialog(page).locator(`[data-report-id="${reportId}"]`).getByTestId("close-report-switch");

/** Puts the switch of a report on or off (they all start on, D242) and checks that it took. */
export async function setCloseSwitch(page: Page, reportId: string, on: boolean) {
  const toggle = closeSwitch(page, reportId);
  if ((await toggle.getAttribute("aria-checked")) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(on));
}

/** Confirm, and waits until the dialog has gone. */
export async function confirmClose(page: Page) {
  await closeDialog(page).getByTestId("close-reports-confirm").click();
  await expect(closeDialog(page)).toHaveCount(0);
}

/** Cancel, and waits until the dialog has gone. */
export async function cancelClose(page: Page) {
  await closeDialog(page).getByTestId("close-reports-cancel").click();
  await expect(closeDialog(page)).toHaveCount(0);
}

/**
 * Checks that no dialog is on the page. The flow reads the reports and opens the dialog a moment after
 * the click, so the check waits a little before it looks.
 */
export async function expectNoCloseDialog(page: Page) {
  await page.waitForTimeout(1_500);
  await expect(closeDialog(page)).toHaveCount(0);
}

/** Opens the status menu of a repair row and picks a status (`inbound`, `in_repair`, `completed`, ...). */
export async function chooseRowStatus(page: Page, row: Locator, status: string) {
  await row.getByTestId("repair-status-menu").click();
  await page.locator(`[data-testid="repair-status-option"][data-status="${status}"]`).click();
}

/**
 * Picks a status in the Status select of the Edit or New repair window (`Dropdown`: a button after the
 * label "Status", and a list portaled to the body, whose rows choose on pointer down). `label` is the
 * word of the pill: "Completed", "In repair".
 */
export async function chooseFormStatus(page: Page, win: Locator, label: string) {
  await win
    .locator('xpath=.//label[normalize-space()="Status"]/following-sibling::div//button')
    .click();
  await page
    .locator("body > ul > li")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();
}
