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
  cellOf,
  openButtonOf,
  openRepairsPage,
  repairRows,
  rowWith,
  serviceRows,
  tab,
  toggleOf,
  windowOf,
} from "./helpers/repairsPage";

/**
 * The repair window as an administrator sees it: the button at the end of a row, the fields, the
 * services with a Total row, the stack of windows and the files, all read-only. Written, not run
 * (project rule); the admin project cannot run locally.
 * Spec: docs/specs/repairs-07-repair-window.md §6 (S28 to S32).
 */
const WINDOW_HEADERS = [
  "Bleacher",
  "Category",
  "Severity",
  "Reported",
  "Description",
  "Labor",
  "Parts",
  "Tax",
  "Freight",
  "Total",
  "",
];

const field = (win: ReturnType<typeof windowOf>, name: string) =>
  win.locator(`[data-field="${name}"]`);

test.describe.configure({ mode: "serial" });

test.describe("Repairs window (admin)", () => {
  let seeded: SeededRepairs;

  test.beforeAll(async () => {
    seeded = await seedRepairs();
  });

  test.afterAll(async () => {
    await seeded?.cleanup();
  });

  test("S28: every row has the open button, which opens the window and does not toggle the row", async ({
    page,
  }) => {
    // The Completed tab: one button for each row, named after the invoice number.
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("repair-open")).toHaveCount(await repairRows(page).count());
    await expect(openButtonOf(done)).toHaveAttribute(
      "aria-label",
      `Open repair ${seeded.completed.invoice}`,
    );
    await expect(openButtonOf(done)).toHaveAttribute("title", "Open repair");

    await openButtonOf(done).click();
    await expect(windowOf(page, "repair")).toBeVisible();
    // The block under the row did not open or close.
    await expect(toggleOf(done)).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Escape");
    await expect(windowOf(page, "repair")).toHaveCount(0);

    // The Open tab: the CAD repair has no invoice number, so its button is named after the bleacher.
    await tab(page, "Open").click();
    const inRepair = rowWith(page, "In repair");
    await expect(inRepair).toBeVisible({ timeout: 60_000 });
    await expect(openButtonOf(inRepair)).toHaveAttribute(
      "aria-label",
      `Open repair of bleacher #${seeded.bleacherA.number}`,
    );

    // Show Deleted: the same cell holds the open button and Restore.
    await openRepairsPage(
      page,
      bleacherQuery(seeded.bleacherA.uuid, "&tab=completed&showDeleted=1"),
    );
    const deleted = rowWith(page, seeded.deletedServices.invoice);
    await expect(deleted).toBeVisible({ timeout: 60_000 });
    await expect(cellOf(deleted, "actions").getByTestId("repair-open")).toBeVisible();
    await expect(cellOf(deleted, "actions").getByTestId("repair-restore")).toBeVisible();

    // The button of a deleted repair opens its window, with the grey Deleted mark.
    await openButtonOf(deleted).click();
    await expect(windowOf(page, "repair").getByTestId("repair-window-title")).toContainText(
      "Deleted",
    );
    await page.keyboard.press("Escape");
    await expect(windowOf(page, "repair")).toHaveCount(0);

    // Restore brings the other deleted repair back and does not open the window.
    const other = rowWith(page, seeded.deleted.invoice);
    await expect(other).toBeVisible();
    await other.getByTestId("repair-restore").click();
    await expect(other).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("S29: the window shows every field of the repair, and nothing that writes", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await openButtonOf(done).click();
    const win = windowOf(page, "repair");
    await expect(win).toBeVisible();

    await expect(win).toContainText("Repair");
    await expect(
      win.getByRole("heading", { name: `${seeded.completed.invoice} · ${seeded.vendorName}` }),
    ).toBeVisible();
    await expect(win.getByTestId("repair-window-created")).toHaveText(
      /^Created \d{4}-\d{2}-\d{2}$/,
    );

    await expect(field(win, "vendor")).toContainText(seeded.vendorName);
    await expect(field(win, "address")).toHaveText(seeded.vendorAddress);
    await expect(field(win, "invoice")).toHaveText(seeded.completed.invoice);
    await expect(field(win, "status")).toHaveText("Completed");
    await expect(field(win, "currency")).toHaveText("USD");
    if (seeded.zones) await expect(field(win, "zone")).toContainText(seeded.zones.a.name);
    await expect(field(win, "from")).toHaveText("2026-09-18");
    await expect(field(win, "to")).toHaveText("2026-09-29");
    await expect(field(win, "completed")).toHaveText("2026-09-29");
    await expect(field(win, "reported")).toContainText(`${REPORT_DAYS.first}`);
    await expect(field(win, "reported")).toContainText("+1");
    await expect(win.getByTestId("repair-window-reports")).toHaveText("View Damage Reports (2)");
    await expect(field(win, "bleachers")).toContainText(`#${seeded.bleacherA.number}`);
    await expect(field(win, "notes")).toContainText(seeded.completed.notes);

    // Nothing that writes, no footer, and no Open repair in the repair window itself (D84).
    await expect(
      win.getByRole("button", { name: /Edit|Delete|Add service|Open repair/ }),
    ).toHaveCount(0);

    // The CAD repair: no vendor and no invoice number, so the title is the bleacher (D97).
    await page.keyboard.press("Escape");
    await tab(page, "Open").click();
    const inRepair = rowWith(page, "In repair");
    await expect(inRepair).toBeVisible({ timeout: 60_000 });
    await openButtonOf(inRepair).click();
    const cadWin = windowOf(page, "repair");
    await expect(
      cadWin.getByRole("heading", { name: `Bleacher #${seeded.bleacherA.number}` }),
    ).toBeVisible();
    await expect(field(cadWin, "vendor")).toHaveText("—");
    await expect(field(cadWin, "invoice")).toHaveText("—");
    await expect(cadWin.locator('[data-field="address"]')).toHaveCount(0);
    await expect(field(cadWin, "currency")).toHaveText("CAD");
    await expect(cadWin.getByTestId("repair-window-reports")).toHaveText("View Damage Report");
  });

  test("S30: the services of the window end with a Total row, and a repair with none says so", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await openButtonOf(done).click();
    const win = windowOf(page, "repair");

    const table = win.getByTestId("repair-window-services");
    await expect(table.getByRole("columnheader")).toHaveText(WINDOW_HEADERS);
    const rows = table.getByTestId("repair-service-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Tires");
    await expect(rows.nth(1)).toContainText("Welding");

    // The Total row: the sums of the services and the repair's own total.
    const total = win.getByTestId("repair-window-total");
    const sum = (key: "labor" | "parts" | "tax" | "freight") =>
      SERVICE_TIRES[key] + SERVICE_WELDING[key];
    await expect(total.locator('[data-col="total-label"]')).toHaveText("Total");
    await expect(total.locator('[data-col="total-labor"]')).toHaveText(usd(sum("labor")));
    await expect(total.locator('[data-col="total-parts"]')).toHaveText(usd(sum("parts")));
    await expect(total.locator('[data-col="total-tax"]')).toHaveText(usd(sum("tax")));
    await expect(total.locator('[data-col="total-freight"]')).toHaveText(usd(sum("freight")));
    await expect(total.locator('[data-col="total-total"]')).toHaveText(
      usd(seeded.completed.totalCents),
    );
    await expect(win.getByRole("button", { name: /Add service/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // One of the 26 cheap repairs on the second bleacher has no services: its Total is its cost.
    await openRepairsPage(
      page,
      bleacherQuery(seeded.bleacherB.uuid, "&tab=completed&pageSize=100"),
    );
    await expect(repairRows(page).first()).toBeVisible({ timeout: 60_000 });
    await openButtonOf(repairRows(page).first()).click();
    const empty = windowOf(page, "repair");
    await expect(empty.getByTestId("repair-services-empty")).toHaveText(
      "No services on this repair.",
    );
    await expect(
      empty.getByTestId("repair-window-total").locator('[data-col="total-total"]'),
    ).toHaveText(/^\$10\.\d\d$/);
    await expect(
      empty.getByTestId("repair-window-total").locator('[data-col="total-labor"]'),
    ).toHaveText("—");
  });

  test("S31: windows stack, and Esc closes only the one on top", async ({ page }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });

    // From the repair window: a service over it (no Open repair there), then the reports.
    await openButtonOf(done).click();
    const repair = windowOf(page, "repair");
    await expect(repair).toBeVisible();
    await repair.getByTestId("repair-service-row").filter({ hasText: "Tires" }).click();
    const service = windowOf(page, "service");
    await expect(service).toBeVisible();
    await expect(service.getByTestId("service-window-open-repair")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(service).toHaveCount(0);
    await expect(repair).toBeVisible();

    await repair.getByTestId("repair-window-reports").click();
    const reports = windowOf(page, "reports");
    await expect(reports).toBeVisible();
    await expect(reports.getByTestId("damage-report-card")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(reports).toHaveCount(0);
    await expect(repair).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(repair).toHaveCount(0);

    // From the table: a service window has Open repair; the repair window opens over it.
    await toggleOf(done).click();
    await serviceRows(page).filter({ hasText: "Tires" }).click();
    await expect(service).toBeVisible();
    await service.getByTestId("service-window-open-repair").click();
    await expect(repair).toBeVisible();
    await expect(service).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(repair).toHaveCount(0);
    await expect(service).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(service).toHaveCount(0);
  });

  test("S32: the files are listed by type, open in a new tab, and a repair with none says so", async ({
    page,
  }) => {
    await openRepairsPage(page, bleacherQuery(seeded.bleacherA.uuid, "&tab=completed"));
    const done = rowWith(page, seeded.completed.invoice);
    await expect(done).toBeVisible({ timeout: 60_000 });
    await openButtonOf(done).click();
    const win = windowOf(page, "repair");

    const files = win.getByTestId("repair-files");
    await expect(files.getByRole("heading", { name: "Files" })).toBeVisible();
    const entries = files.getByTestId("repair-file");
    await expect(entries).toHaveCount(2, { timeout: 30_000 });
    await expect(entries.nth(0)).toContainText("Photo 1");
    await expect(entries.nth(0)).toContainText("Added 2026-09-18");
    await expect(entries.nth(1)).toContainText("PDF 1");

    // The name and the button are links to the object, each in a new tab.
    const links = entries.nth(0).locator("a");
    await expect(links).toHaveCount(2);
    for (const index of [0, 1]) {
      await expect(links.nth(index)).toHaveAttribute("target", "_blank");
      await expect(links.nth(index)).toHaveAttribute(
        "href",
        new RegExp(`maintenance-photos.*${seeded.repairFiles.photoPath}`),
      );
    }
    await expect(entries.nth(1).getByRole("link", { name: "Open PDF 1" })).toHaveAttribute(
      "href",
      new RegExp(seeded.repairFiles.pdfPath),
    );
    await expect(win.getByRole("button", { name: /Delete|Upload/ })).toHaveCount(0);
    await page.keyboard.press("Escape");

    // A repair with no files says so.
    await tab(page, "Open").click();
    const inRepair = rowWith(page, "In repair");
    await expect(inRepair).toBeVisible({ timeout: 60_000 });
    await openButtonOf(inRepair).click();
    await expect(windowOf(page, "repair").getByTestId("repair-files")).toContainText("No files.", {
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");

    // The Files section is in the window of a deleted repair too.
    await openRepairsPage(
      page,
      bleacherQuery(seeded.bleacherA.uuid, "&tab=completed&showDeleted=1"),
    );
    const deleted = rowWith(page, seeded.deletedServices.invoice);
    await expect(deleted).toBeVisible({ timeout: 60_000 });
    await openButtonOf(deleted).click();
    await expect(windowOf(page, "repair").getByTestId("repair-files")).toContainText("No files.", {
      timeout: 30_000,
    });
  });
});
