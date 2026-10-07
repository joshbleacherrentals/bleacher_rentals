import { test, expect, type Page } from "@playwright/test";
import {
  cleanUp,
  findCompanyByName,
  findContactByLastName,
  readCompanyRow,
  readContactRow,
  seedCompany,
  seedContact,
} from "./helpers/addressBookTestData";

/**
 * The Accountant creates, edits and soft-deletes companies and contacts on /companies-contacts —
 * docs/specs/accountant-address-book.md §5, S1–S5.
 *
 * Like the viewer spec, every write is judged by the row in Postgres, not by what the page says: a
 * write the server refuses still looks done on this client until the next sync. The venue and
 * address writes are NOT driven here — an address is typed into a Google Places autocomplete and a
 * venue is made through the Default Venue picker, neither of which a test can drive without the
 * Places API; supabase/tests/accountant_address_book.test.sql asserts those writes (and every
 * refusal) at the database.
 *
 * This project only exists once E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts), so
 * the file is inert until the Clerk user — with a seeded Users + Accountants row — is created.
 */

test.describe.configure({ mode: "serial" });

const PREFIX = `Acct Book ${Date.now()}`;

/**
 * TextField renders <label> and <input> as siblings with no htmlFor/id between them, so
 * getByLabel cannot find these fields. Address the input by its label's adjacency instead.
 */
const field = (page: Page, label: string) => page.locator(`label:has-text("${label}") + input`);

type Tab = "Companies" | "Contacts";

async function openTab(page: Page, tab: Tab) {
  await page.goto("/companies-contacts");
  await page.getByRole("tab", { name: tab }).click();
}

/** Waits for a seeded row to reach this client (Postgres → PowerSync), then opens it. */
async function openRow(page: Page, tab: Tab, name: string) {
  const row = page.locator("tbody tr").filter({ hasText: name }).first();
  try {
    await expect(row).toBeVisible({ timeout: 60_000 });
  } catch {
    await openTab(page, tab);
    await expect(row).toBeVisible({ timeout: 60_000 });
  }
  await row.click();
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 15_000 });
}

test.afterAll(async () => {
  await cleanUp(PREFIX);
});

test.describe("Companies & Contacts (accountant)", () => {
  test("S1 — the sidebar offers Companies & Contacts and the page opens with both tabs", async ({
    page,
  }) => {
    await page.goto("/accountant");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByText("Companies & Contacts", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await sidebar.getByText("Companies & Contacts", { exact: true }).click();

    await expect(page).toHaveURL(/\/companies-contacts/, { timeout: 30_000 });
    await expect(page.getByRole("tab", { name: "Companies" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Contacts" })).toBeVisible();

    // Nothing else operational was added with it.
    for (const label of ["Dashboard", "Team", "Assets"]) {
      await expect(sidebar.getByText(label, { exact: true }), label).toHaveCount(0);
    }
  });

  test("S2 — creates a company, and the row reaches Postgres", async ({ page }) => {
    const name = `${PREFIX} Created Co`;

    await openTab(page, "Companies");
    await page.getByRole("button", { name: "New Company" }).click();
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 15_000 });

    await field(page, "Company Name").fill(name);
    await page.getByRole("button", { name: "Save Company" }).click();

    await expect
      .poll(async () => (await findCompanyByName(name))?.company_name, { timeout: 30_000 })
      .toBe(name);
    expect((await findCompanyByName(name))?.deleted).toBe(false);
  });

  test("S3 — edits a company's name and phone, and leaves its address rows alone", async ({
    page,
  }) => {
    const name = `${PREFIX} Edited Co`;
    const company = await seedCompany({
      name,
      phone: "+1-555-1000",
      billing: {
        street: "1 Billing Way",
        city: "Tampa",
        state_province: "FL",
        zip_postal: "33601",
      },
      shipping: {
        street: "77 Shipping Dock",
        city: "Savannah",
        state_province: "GA",
        zip_postal: "31401",
      },
    });

    await openTab(page, "Companies");
    await openRow(page, "Companies", name);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit Company" })).toBeVisible();

    await field(page, "Company Name").fill(`${name} Renamed`);
    await field(page, "Phone").fill("+1-555-2000");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(async () => (await readCompanyRow(company.id))?.phone, { timeout: 30_000 })
      .toBe("+1-555-2000");
    const stored = await readCompanyRow(company.id);
    expect(stored?.company_name).toBe(`${name} Renamed`);
    expect(stored?.billing_address_uuid).toBe(company.billingId);
    expect(stored?.shipping_address_uuid).toBe(company.shippingId);
  });

  test("S4 — creates a contact, then edits it", async ({ page }) => {
    const lastName = `${PREFIX} Contact`;

    await openTab(page, "Contacts");
    await page.getByRole("button", { name: "New Contact" }).click();
    await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 15_000 });

    await field(page, "First Name").fill("Alex");
    await field(page, "Last Name").fill(lastName);
    await field(page, "Email").fill(`alex-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Save Contact" }).click();

    await expect
      .poll(async () => (await findContactByLastName(lastName))?.first_name, { timeout: 30_000 })
      .toBe("Alex");
    const created = await findContactByLastName(lastName);
    expect(created?.deleted).toBe(false);

    await openRow(page, "Contacts", lastName);
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit Contact" })).toBeVisible();
    await field(page, "First Name").fill("Alexandra");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(async () => (await readContactRow(created!.id))?.first_name, { timeout: 30_000 })
      .toBe("Alexandra");
  });

  test("S5 — deletes a contact and a company: both leave the lists, both rows stay, marked deleted", async ({
    page,
  }) => {
    const companyName = `${PREFIX} Doomed Co`;
    const lastName = `${PREFIX} Doomed`;
    const company = await seedCompany({
      name: companyName,
      billing: { street: "9 Gone St", city: "Tampa", state_province: "FL", zip_postal: "33601" },
    });
    const contact = await seedContact({ firstName: "Gone", lastName });

    // The page confirms a delete with window.confirm.
    page.on("dialog", (dialog) => dialog.accept());

    await test.step("Delete the contact", async () => {
      await openTab(page, "Contacts");
      await openRow(page, "Contacts", lastName);
      await page.getByRole("button", { name: "Delete", exact: true }).click();

      await expect
        .poll(async () => (await readContactRow(contact.id))?.deleted, { timeout: 30_000 })
        .toBe(true);
      await expect(page.locator("tbody tr").filter({ hasText: lastName })).toHaveCount(0);
    });

    await test.step("Delete the company", async () => {
      await openTab(page, "Companies");
      await openRow(page, "Companies", companyName);
      await page.getByRole("button", { name: "Delete", exact: true }).click();

      await expect
        .poll(async () => (await readCompanyRow(company.id))?.deleted, { timeout: 30_000 })
        .toBe(true);
      await expect(page.locator("tbody tr").filter({ hasText: companyName })).toHaveCount(0);
    });
  });
});
