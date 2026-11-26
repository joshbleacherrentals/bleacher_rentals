import { expect, type Locator, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Helpers of the Vendors page specs (docs/specs/vendors-page.md §6.3). The UI is what the specs
 * click; the service-role client seeds vendors and proves a write landed in Postgres, because a
 * write the server refuses still looks done on the client until the next sync.
 * The page reads from PowerSync, so a seeded row arrives a moment after the page opens.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for e2e fixture seeding",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The service-role client, for the scenarios that read what the page wrote. */
export function serviceRoleClient() {
  return adminClient();
}

export type SeedVendor = {
  name: string;
  type?: "driver" | "repairs";
  status?: "verified" | "caution" | "under_review" | "prospect" | "do_not_use" | null;
  isActive?: boolean;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  doesTrailerRepair?: boolean;
  doesAluminumWelding?: boolean;
  address?: { street: string; city: string; stateProvince: string; country?: string };
};

export type SeededVendor = { id: string; name: string; addressId: string | null };

/** A vendor (and its address, when given) straight into the database. */
export async function seedVendor(input: SeedVendor): Promise<SeededVendor> {
  const supabase = adminClient();
  let addressId: string | null = null;
  if (input.address) {
    const { data, error } = await supabase
      .from("Addresses")
      .insert({
        street: input.address.street,
        city: input.address.city,
        state_province: input.address.stateProvince,
        country: input.address.country ?? "US",
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`seed address failed: ${error?.message}`);
    addressId = data.id as string;
  }
  const id = randomUUID();
  const { error } = await supabase.from("Vendors").insert({
    id,
    display_name: input.name,
    type: input.type ?? "driver",
    status: input.status ?? null,
    is_active: input.isActive ?? true,
    contact_name: input.contactName ?? null,
    phone: input.phone ?? null,
    contact_email: input.email ?? null,
    notes: input.notes ?? null,
    does_trailer_repair: input.doesTrailerRepair ?? false,
    does_aluminum_welding: input.doesAluminumWelding ?? false,
    address_uuid: addressId,
  });
  if (error) throw new Error(`seed vendor failed: ${error.message}`);
  return { id, name: input.name, addressId };
}

export async function readVendor(id: string) {
  const { data, error } = await adminClient().from("Vendors").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`read vendor failed: ${error?.message}`);
  return data as Record<string, unknown>;
}

export async function findVendorsByPrefix(prefix: string) {
  const { data, error } = await adminClient()
    .from("Vendors")
    .select("*")
    .like("display_name", `${prefix}%`);
  if (error) throw new Error(`read vendors failed: ${error.message}`);
  return (data ?? []) as Record<string, unknown>[];
}

export async function readAddress(id: string) {
  const { data } = await adminClient().from("Addresses").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

/** Removes every vendor whose name starts with `prefix`, and the addresses they point at. */
export async function deleteVendorsByPrefix(prefix: string): Promise<void> {
  const supabase = adminClient();
  const vendors = await findVendorsByPrefix(prefix);
  if (vendors.length === 0) return;
  const ids = vendors.map((v) => v.id as string);
  const addressIds = vendors
    .map((v) => v.address_uuid as string | null)
    .filter(Boolean) as string[];
  await supabase.from("Drivers").update({ vendor_uuid: null }).in("vendor_uuid", ids);
  const { error } = await supabase.from("Vendors").delete().in("id", ids);
  if (error) throw new Error(`delete vendors failed: ${error.message}`);
  if (addressIds.length > 0) await supabase.from("Addresses").delete().in("id", addressIds);
}

// ── The page ──────────────────────────────────────────────────────────────────

/** Opens /vendors and waits until the list has loaded. */
export async function openVendorsPage(page: Page) {
  await page.goto("/vendors");
  await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("vendors-table")).toBeVisible({ timeout: 60_000 });
}

export const vendorRows = (page: Page) => page.getByTestId("vendor-row");

/** The row that holds `text` (a name, a contact, a city). */
export const rowWith = (page: Page, text: string | RegExp) =>
  vendorRows(page).filter({ hasText: text });

/** One cell of a row, by its column key (`vendor`, `type`, `status`, `services`, `contact`, `location`). */
export const cellOf = (row: Locator, key: string) => row.locator(`[data-col="${key}"]`);

export const searchBox = (page: Page) => page.getByLabel("Search vendors");

/** The Type filter of the toolbar (the window's own select is labelled "Type *"). */
export const typeFilter = (page: Page) => page.getByLabel("Type", { exact: true });

export const showDeletedSwitch = (page: Page) => page.getByLabel("Show Deleted");

export const addButton = (page: Page) => page.getByRole("button", { name: "Add vendor" });

/** Ticks (or unticks) one option of the Status filter by its label and closes the dropdown. */
export async function toggleStatus(page: Page, label: string) {
  await page.getByRole("button", { name: /^Status/ }).click();
  await page
    .getByRole("group", { name: "Status filter" })
    .getByRole("menuitemcheckbox", { name: label, exact: true })
    .click();
  await page.keyboard.press("Escape");
}

/** The ids of the rows on screen, in order. */
export async function rowNames(page: Page): Promise<string[]> {
  return (await cellOf(vendorRows(page), "vendor").allTextContents()).map((t) =>
    t.replace(/^[A-Z?]\s*/, "").trim(),
  );
}

// ── The vendor window ─────────────────────────────────────────────────────────

export const vendorWindow = (page: Page) => page.getByRole("dialog");

export type WindowFields = {
  name?: string;
  type?: "driver" | "repairs";
  status?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  notes?: string;
  aluminumWelding?: boolean;
  trailerRepair?: boolean;
};

/** Fills the fields given; leaves the others as they are. */
export async function fillVendorWindow(page: Page, f: WindowFields) {
  if (f.name !== undefined) await page.locator("#displayName").fill(f.name);
  if (f.type) await page.locator("#vendorType").selectOption(f.type);
  if (f.status !== undefined) await page.locator("#vendorStatus").selectOption(f.status);
  if (f.contactName !== undefined) await page.locator("#vendorContactName").fill(f.contactName);
  if (f.phone !== undefined) await page.locator("#vendorPhone").fill(f.phone);
  if (f.email !== undefined) await page.locator("#vendorContactEmail").fill(f.email);
  if (f.notes !== undefined) await page.locator("#vendorNotes").fill(f.notes);
  if (f.aluminumWelding !== undefined) {
    await page.locator("#vendorServiceDoesAluminumWelding").setChecked(f.aluminumWelding);
  }
  if (f.trailerRepair !== undefined) {
    await page.locator("#vendorServiceDoesTrailerRepair").setChecked(f.trailerRepair);
  }
}

export const saveButton = (page: Page) =>
  vendorWindow(page).getByRole("button", { name: "Save", exact: true });

/** Clicks Save and waits for the success toast. */
export async function saveVendorWindow(page: Page) {
  await saveButton(page).click();
  await expect(page.getByText(/(created|updated) successfully/)).toBeVisible({ timeout: 30_000 });
}

/** Clicks Delete, confirms, and waits for the toast. */
export async function deleteVendorInWindow(page: Page) {
  await vendorWindow(page).getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete Vendor" }).click();
  await expect(page.getByText(/deleted$/)).toBeVisible({ timeout: 30_000 });
}
