import { test, expect, type Page } from "@playwright/test";
import { deleteUserByEmail } from "./helpers/accountantFixtures";
import {
  columnsAnAccountantCannotChange,
  deletePayRanges,
  deleteVendorsByName,
  findVendorsByName,
  readDriverRow,
  readPayRanges,
  restoreDriverPay,
  seedInactiveDriver,
  type DriverRow,
} from "./helpers/teamTestData";

/**
 * The Accountant on the Team page — docs/specs/accountant-team.md §7, S1–S9.
 *
 * It sees every user, opens a driver and edits that driver's payment info and vendor, and nothing
 * else. Every write is judged by the row in Postgres, not by what the page says: a write the server
 * refuses still looks done on this client until the next sync. What a browser cannot drive here —
 * a refused column, a role combination — is asserted in supabase/tests/accountant_team.test.sql.
 *
 * Not driven, and why:
 *   - the rename and delete of a vendor, and the QuickBooks connection picker: the vendor card's
 *     edit control and a seeded QuickBooks connection are not something this spec can rely on; the
 *     database side is in the SQL test, the route side is asserted in S7 through the API;
 *   - S8 (the "Edit Profile" button of the payment modal) needs a seeded week with a driver.
 *
 * This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts), so the
 * file is inert until the Clerk user — with a seeded Users + Accountants row — is created.
 */

test.describe.configure({ mode: "serial" });

// Seeded in supabase/seed.sql: a Lakeland, Florida driver with a full profile (pay 300 USD per MI,
// setup and teardown 5000, phone 605-431-0937).
const DRIVER_USER_UUID = "e44cdd00-6fde-46f2-869f-7a854f013e0c";
const driverUrl = `/team/${DRIVER_USER_UUID}/edit/driver`;

const PREFIX = `Acct Team ${Date.now()}`;
const INACTIVE_EMAIL = `acct-team-inactive-${Date.now()}@example.test`;

let original: DriverRow;

/** The pay fields render before the driver's row arrives; the phone only comes from that row. */
async function gotoLoadedDriver(page: Page, url = driverUrl) {
  await page.goto(url);
  await expect(page.getByRole("heading", { name: "Document Uploads" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator('input[type="tel"]')).not.toHaveValue("", { timeout: 60_000 });
}

/** Types into a controlled, re-formatting field the way a person does (`fill()` can leave the old value). */
async function typeInto(page: Page, label: string, text: string) {
  const input = page.getByLabel(label);
  await input.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

async function openTab(page: Page, label: string) {
  await page
    .locator("button", { hasText: new RegExp(`^${label}$`) })
    .first()
    .click();
}

test.beforeAll(async () => {
  original = await readDriverRow(DRIVER_USER_UUID);
});

test.afterAll(async () => {
  await restoreDriverPay(original);
  await deletePayRanges(original.id);
  await deleteVendorsByName(PREFIX);
  await deleteUserByEmail(INACTIVE_EMAIL);
});

test.describe("Team (accountant)", () => {
  test("S1 — the sidebar offers Team, the page opens, and there is no way to add a member", async ({
    page,
  }) => {
    await page.goto("/accountant");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByText("Team", { exact: true })).toBeVisible({ timeout: 60_000 });
    await sidebar.getByText("Team", { exact: true }).click();

    await expect(page).toHaveURL(/\/team$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Manage Team" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Team Member/ })).toHaveCount(0);

    for (const label of ["Dashboard", "Assets"]) {
      await expect(sidebar.getByText(label, { exact: true }), label).toHaveCount(0);
    }
  });

  test("S2 — every tab lists its users, and the search box filters", async ({ page }) => {
    await page.goto("/team");

    for (const tab of ["Admins", "Account Managers", "Drivers", "Viewers"]) {
      await openTab(page, tab);
      await expect(page.locator("tbody tr").first(), tab).toBeVisible({ timeout: 60_000 });
    }

    await openTab(page, "Drivers");
    const before = await page.locator("tbody tr").count();
    await page.getByPlaceholder("Search by name or email...").fill("zzzz-no-such-person");
    await expect(page.locator("tbody tr")).toHaveCount(0, { timeout: 15_000 });
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.locator("tbody tr")).toHaveCount(before, { timeout: 15_000 });
  });

  test("S3 — an admin's row does nothing; a driver's row opens the profile with two tabs", async ({
    page,
  }) => {
    await page.goto("/team");

    await openTab(page, "Admins");
    const adminRow = page.locator("tbody tr").first();
    await expect(adminRow).toBeVisible({ timeout: 60_000 });
    await adminRow.click();
    await expect(page).toHaveURL(/\/team$/);

    await openTab(page, "Drivers");
    await page.locator("tbody tr").filter({ hasText: "Sharp" }).first().click();
    await expect(page).toHaveURL(/\/team\/[^/]+\/edit\/basic-user-info/, { timeout: 30_000 });

    // The name and the email cannot be changed.
    await expect(page.locator("#firstName")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator("#email")).toHaveAttribute("readonly", "");

    // Exactly two tabs, and nothing that changes roles.
    await expect(page.getByRole("link", { name: "Basic User Info" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Driver", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Administrator" })).toHaveCount(0);
    await expect(page.getByText("+ Add Role")).toHaveCount(0);
    await expect(page.getByLabel(/^Remove .* role$/)).toHaveCount(0);
    await expect(page.getByText(/payment info, vendor and driver type/)).toBeVisible();
  });

  test("S4 — payment info is saved, and not one other column of the row changes", async ({
    page,
  }) => {
    await gotoLoadedDriver(page);

    await typeInto(page, "Tax rate percent", "13");
    await typeInto(page, "Deadhead amount per MI", "12.34");
    await typeInto(page, "Setup pay amount", "55.00");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("User updated successfully")).toBeVisible({ timeout: 30_000 });

    const row = await readDriverRow(DRIVER_USER_UUID);
    expect(Number(row.tax_dec)).toBe(13);
    expect(row.deadhead_cents).toBe(1234);
    expect(row.setup_cents).toBe(5500);

    // Everything an accountant may not change is exactly as it was.
    expect(columnsAnAccountantCannotChange(row)).toEqual(columnsAnAccountantCannotChange(original));
  });

  test("S5 — a pay tier can be added and is stored", async ({ page }) => {
    await gotoLoadedDriver(page);

    await page.getByRole("button", { name: "Add range" }).first().click();
    await page.getByLabel("Cutoff in MI").fill("100");
    await page.getByLabel("Cutoff in MI").press("Enter");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("User updated successfully")).toBeVisible({ timeout: 30_000 });

    expect((await readPayRanges(original.id)).length).toBeGreaterThan(0);
  });

  test("S6 — the zones and the Driver Setup block are shown and cannot be changed", async ({
    page,
  }) => {
    await gotoLoadedDriver(page);

    // The phone is shown, and the whole Driver Setup block does not take the pointer.
    await expect(page.locator('input[type="tel"]')).toHaveValue(/\d/);
    await expect(page.locator("section", { hasText: "Driver Setup" })).toHaveCSS(
      "pointer-events",
      "none",
    );

    // A document cannot be changed, but it can be opened: its link is live although the block is
    // locked (a trial click checks that the link would receive the click), and nothing offers a
    // replacement or a removal.
    const documentLink = page.getByRole("link", { name: /^Open / }).first();
    await expect(documentLink).toHaveAttribute("target", "_blank");
    await documentLink.click({ trial: true });
    // ...and it is not faded: the opacity of the element and of every ancestor multiplies to 1.
    const effectiveOpacity = await documentLink.evaluate((el) => {
      let opacity = 1;
      for (let node: Element | null = el; node; node = node.parentElement) {
        opacity *= Number(getComputedStyle(node).opacity);
      }
      return opacity;
    });
    expect(effectiveOpacity).toBe(1);
    await expect(page.getByLabel(/^Replace /)).toHaveCount(0);
    await expect(page.getByLabel(/^Remove .* license|^Remove Driver/)).toHaveCount(0);

    // The zones selector is the only control of that block that is a button; it is disabled.
    const zones = page.locator("div", { has: page.getByText("Zones", { exact: true }) }).last();
    await expect(zones.locator("button").first()).toBeDisabled();
  });

  test("S7 — a vendor can be created from the driver page, and the QuickBooks connections route is read-only for an accountant", async ({
    page,
  }) => {
    await gotoLoadedDriver(page);

    // Contractor shows the vendor picker; "Create New Vendor Company" opens the modal.
    await page.getByText("Employee", { exact: true }).first().click();
    await page.getByText("Contractor", { exact: true }).click();
    await page.getByText("Please Assign a Vendor.").click();
    await page.getByRole("button", { name: /Create New Vendor Company/ }).click();

    await page.locator("#displayName").fill(`${PREFIX} vendor`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/created successfully/)).toBeVisible({ timeout: 30_000 });

    await expect
      .poll(async () => (await findVendorsByName(PREFIX)).length, { timeout: 30_000 })
      .toBe(1);

    // The accountant may read the list of QuickBooks connections (the vendor modal needs it)...
    const read = await page.request.get("/api/quickbooks/connections");
    expect(read.status()).toBe(200);
    // ...and may not change one.
    const write = await page.request.post("/api/quickbooks/connections", {
      data: { displayName: `${PREFIX} connection` },
    });
    expect(write.status()).toBe(403);
  });

  test.skip("S8 — the Edit Profile button of the payment modal opens the driver page", async () => {
    // Needs a seeded week with a released driver; the button is shown by canAccessPath(roles, "/team").
  });

  test("S9 — a deactivated driver is edited like an active one", async ({ page }) => {
    const { userUuid } = await seedInactiveDriver(INACTIVE_EMAIL);

    await gotoLoadedDriverWithoutPhone(page, `/team/${userUuid}/edit/driver`);
    await typeInto(page, "Deadhead amount per KM", "7.00");
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByText("User updated successfully")).toBeVisible({ timeout: 30_000 });

    const row = await readDriverRow(userUuid);
    expect(row.deadhead_cents).toBe(700);
  });
});

/** A seeded probe driver has no phone, so the form is "loaded" once the pay fields are there. */
async function gotoLoadedDriverWithoutPhone(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByLabel("Tax rate percent")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible({ timeout: 60_000 });
}
