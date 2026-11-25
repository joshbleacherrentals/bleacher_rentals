import { expect, type Locator, type Page } from "@playwright/test";
import {
  damageReportCardByNote,
  waitForDamageReportsLoaded,
} from "../../../manageTeam/e2e/helpers/damageReportsPage";
import { newRepairWindow, newServiceWindow } from "./linksFlow";

/**
 * What the spec 11 scenarios (S51 to S56) do outside the Repairs page: open the Dashboard and its
 * "+ Create" menu, and open the card of a damage report. The grid of the Dashboard is a PixiJS canvas
 * with no click hook, so a bar and the icon of a cell are not driven here; only the DOM is.
 * docs/specs/repairs-11-dashboard.md §6.
 */

export const CREATE_REPAIR_BUTTON = "Create Maintenance to Resolve";
export const CREATE_REPAIR_HINT =
  "To resolve this report, create a repair for it. The report closes when the repair is Completed.";
export const REQUIRE_SERVICE_MESSAGE = "Add at least one service.";

/** The days the scenarios give a repair. */
export const REPAIR_DAYS = { from: "2026-10-20", to: "2026-10-25" };

/** The roles of the user decide what the toolbar draws, and they arrive after the page. */
const ROLES_TIMEOUT = 120_000;

/**
 * Opens /dashboard in the viewport the other Dashboard specs use, and waits for the toolbar (the Rows
 * button is drawn for every role). A scenario that expects "+ Create" waits for it on its own.
 */
export async function openDashboard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /^(All|10|15) Rows$/ })).toBeVisible({
    timeout: ROLES_TIMEOUT,
  });
}

export const createButton = (page: Page) => page.getByRole("button", { name: /\+ Create/ });

/** Waits for "+ Create" (it needs the roles of the user), opens its menu and returns the items. */
export async function openCreateMenu(page: Page) {
  await expect(createButton(page)).toBeVisible({ timeout: ROLES_TIMEOUT });
  await createButton(page).click();
  return page.getByRole("menuitem");
}

/**
 * What "Maintenance Event" opens: the New repair window with no days and no service, and no service
 * form over it (S51 and S54).
 */
export async function expectEmptyNewRepairWindow(page: Page) {
  const win = newRepairWindow(page);
  await expect(win).toBeVisible();
  await expect(win.locator("#repair-from")).toHaveValue("");
  await expect(win.locator("#repair-to")).toHaveValue("");
  await expect(win.getByTestId("repair-services-empty")).toBeVisible();
  await expect(newServiceWindow(page)).toHaveCount(0);
}

/**
 * Opens the Damage Reports page and returns the card of the report with this note once it is drawn.
 * The report arrives through PowerSync, so the wait is long.
 */
export async function findReportCard(page: Page, note: string): Promise<Locator> {
  await page.goto("/damage-reports");
  await waitForDamageReportsLoaded(page);
  const card = damageReportCardByNote(page, note);
  await expect(card).toBeVisible({ timeout: ROLES_TIMEOUT });
  return card;
}

/** The window of an open card, the one with the title "Edit Damage Report". */
export const reportCardDialog = (page: Page) =>
  page.getByRole("dialog").filter({ hasText: "Edit Damage Report" });

/** Clicks a card and returns the dialog it opens. */
export async function openReportCard(page: Page, card: Locator): Promise<Locator> {
  await card.click();
  const dialog = reportCardDialog(page);
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  return dialog;
}
