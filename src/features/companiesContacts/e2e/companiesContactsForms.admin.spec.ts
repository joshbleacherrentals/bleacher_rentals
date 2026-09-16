import { test, expect, type Page } from "@playwright/test";
import {
  cleanUp,
  readCompany,
  readContact,
  seedCompany,
  seedContact,
  seedVenue,
} from "./helpers/addressBookTestData";

/**
 * The shared Company / Contact form, seen from the page that uses it — see
 * docs/specs/companies-contacts-forms.md §6.
 *
 * Seeded rows travel Postgres → PowerSync → this client, so every first look at a seeded row
 * waits on the list rather than assuming it is already there.
 */

// Serial: every test seeds rows that have to travel Postgres → PowerSync → this client, and
// several workers seeding at once starve that sync long enough to time the list wait out.
test.describe.configure({ mode: "serial" });

const PREFIX = `Forms ${Date.now()}`;

const billing = {
  street: "1 Billing Way",
  city: "Tampa",
  state_province: "FL",
  zip_postal: "33601",
  country: "US",
};
const shipping = {
  street: "77 Shipping Dock",
  city: "Savannah",
  state_province: "GA",
  zip_postal: "31401",
  country: "US",
};

/**
 * TextField renders <label> and <input> as siblings with no htmlFor/id between them, so
 * getByLabel cannot find these fields. Address the input by its label's adjacency instead.
 */
const field = (page: Page, label: string) => page.locator(`label:has-text("${label}") + input`);

const search = (page: Page, placeholder: string) => page.getByPlaceholder(placeholder);

type Tab = "Companies" | "Contacts";

async function openTab(page: Page, tab: Tab) {
  await page.goto("/companies-contacts");
  await page.getByRole("tab", { name: tab }).click();
}

/**
 * Waits for a seeded row to reach this client. A row inserted straight into Postgres travels
 * through PowerSync before the list can show it, so this waits on the live list and, if that is
 * not enough, re-opens the page once (which re-opens the tab too — a reload alone drops back to
 * the Companies tab).
 */
async function waitForRow(page: Page, tab: Tab, name: string) {
  const row = page.locator("tbody tr").filter({ hasText: name }).first();
  try {
    await expect(row).toBeVisible({ timeout: 60_000 });
  } catch {
    await openTab(page, tab);
    await expect(row).toBeVisible({ timeout: 60_000 });
  }
  return row;
}

/** Opens a row by the text in its first column, waiting for it to sync in. */
async function openRow(page: Page, tab: Tab, name: string) {
  const row = await waitForRow(page, tab, name);
  await row.click();
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 15_000 });
}

test.afterAll(async () => {
  await cleanUp(PREFIX);
});

test.describe("Company form", () => {
  test("shows both addresses, and edit keeps them", async ({ page }) => {
    const name = `${PREFIX} Addresses Co`;
    const company = await seedCompany({
      name,
      phone: "+1-555-1000",
      billing,
      shipping,
    });

    await openTab(page, "Companies");
    await openRow(page, "Companies", name);

    await test.step("The detail view shows billing and shipping", async () => {
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toContainText("1 Billing Way");
      await expect(dialog).toContainText("77 Shipping Dock");
    });

    await test.step("Edit shows both addresses, unticked", async () => {
      await page.getByRole("button", { name: "Edit" }).click();
      await expect(page.getByRole("heading", { name: "Edit Company" })).toBeVisible();
      await expect(
        page.getByRole("checkbox", { name: "Shipping same as billing" }),
      ).not.toBeChecked();
      // An address sits in an autocomplete input, so its value is not part of the dialog's text.
      // Billing is the first such input in the form, shipping the second.
      const addressInputs = page.locator('input[placeholder="Enter address..."]');
      await expect(addressInputs.nth(0)).toHaveValue(/1 Billing Way/);
      await expect(addressInputs.nth(1)).toHaveValue(/77 Shipping Dock/);
    });

    await test.step("Saving a phone change leaves both address rows alone", async () => {
      await field(page, "Phone").fill("+1-555-2000");
      await page.getByRole("button", { name: "Save", exact: true }).click();

      await expect
        .poll(async () => (await readCompany(company.id))?.phone, { timeout: 30_000 })
        .toBe("+1-555-2000");

      const stored = await readCompany(company.id);
      expect(stored?.billing_address_uuid).toBe(company.billingId);
      expect(stored?.shipping_address_uuid).toBe(company.shippingId);
    });
  });

  test("reads shipping as same as billing when the two match", async ({ page }) => {
    const name = `${PREFIX} Same Co`;
    await seedCompany({ name, billing, shipping: { ...billing } });

    await openTab(page, "Companies");
    await openRow(page, "Companies", name);

    await expect(page.getByRole("dialog").first()).toContainText("Same as billing");
  });

  test("search matches a shipping address", async ({ page }) => {
    const name = `${PREFIX} Searchable Co`;
    await seedCompany({ name, billing, shipping });

    await openTab(page, "Companies");
    await waitForRow(page, "Companies", name);

    await search(page, "Search companies...").fill("Savannah");
    await expect(page.locator("tbody tr").filter({ hasText: name })).toBeVisible();

    await search(page, "Search companies...").fill("33601");
    await expect(page.locator("tbody tr").filter({ hasText: name })).toBeVisible();
  });
});

test.describe("Contact form", () => {
  test("shows the venue, and an unrelated edit keeps it", async ({ page }) => {
    const venueName = `${PREFIX} Stadium`;
    const venue = await seedVenue({
      name: venueName,
      address: {
        street: "5 Park Ave",
        city: "Lincoln",
        state_province: "NE",
        zip_postal: "68508",
      },
    });
    const lastName = `${PREFIX} Venue`;
    const contact = await seedContact({
      firstName: "Jane",
      lastName,
      email: `jane-${Date.now()}@example.com`,
      defaultVenueId: venue.id,
    });

    await openTab(page, "Contacts");
    await openRow(page, "Contacts", lastName);

    await test.step("The detail view names the venue", async () => {
      const dialog = page.getByRole("dialog").first();
      await expect(dialog).toContainText(venueName);
      await expect(dialog).toContainText("5 Park Ave");
    });

    await test.step("Editing the name keeps default_venue_uuid", async () => {
      await page.getByRole("button", { name: "Edit" }).click();
      await expect(page.getByRole("heading", { name: "Edit Contact" })).toBeVisible();
      await expect(page.getByRole("dialog").first()).toContainText(venueName);

      await field(page, "First Name").fill("Janet");
      await page.getByRole("button", { name: "Save", exact: true }).click();

      await expect
        .poll(async () => (await readContact(contact.id))?.first_name, { timeout: 30_000 })
        .toBe("Janet");
      expect((await readContact(contact.id))?.default_venue_uuid).toBe(venue.id);
    });
  });

  test("blocks an edit that duplicates another contact's email", async ({ page }) => {
    const takenEmail = `taken-${Date.now()}@example.com`;
    await seedContact({ firstName: "Taken", lastName: `${PREFIX} Taken`, email: takenEmail });
    const lastName = `${PREFIX} Duplicate`;
    const contact = await seedContact({
      firstName: "Dup",
      lastName,
      email: `dup-${Date.now()}@example.com`,
    });

    await openTab(page, "Contacts");
    await openRow(page, "Contacts", lastName);
    await page.getByRole("button", { name: "Edit" }).click();

    await test.step("Its own email is fine", async () => {
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
    });

    await test.step("Another contact's email blocks Save", async () => {
      await field(page, "Email").fill(takenEmail);
      await expect(page.getByText("Duplicate contact blocked")).toBeVisible();
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
      expect((await readContact(contact.id))?.email).not.toBe(takenEmail);
    });
  });

  test("search matches venue, company address and language", async ({ page }) => {
    const companyName = `${PREFIX} Client Co`;
    const company = await seedCompany({ name: companyName, billing, shipping });
    const venueName = `${PREFIX} Fairgrounds`;
    const venue = await seedVenue({
      name: venueName,
      address: {
        street: "9 Fair Rd",
        city: "Modesto",
        state_province: "CA",
        zip_postal: "95350",
      },
    });
    const lastName = `${PREFIX} Searchable`;
    await seedContact({
      firstName: "Marie",
      lastName,
      companyId: company.id,
      defaultVenueId: venue.id,
      preferredLanguage: "french",
    });

    await openTab(page, "Contacts");
    const row = await waitForRow(page, "Contacts", lastName);

    for (const query of ["Fairgrounds", "9 Fair Rd", "Savannah", "33601", "French"]) {
      await test.step(`finds the contact by "${query}"`, async () => {
        await search(page, "Search contacts...").fill(query);
        await expect(row).toBeVisible();
      });
    }
  });
});
