import { createClient } from "@supabase/supabase-js";
import type { Locator, Page } from "@playwright/test";

/**
 * Shared by the Quote Types specs (docs/specs/qbo-invoice-12a-quote-types-page.md §5).
 *
 * QuickBooks itself is replaced by fakes: the connection list and the Items list are answered in
 * the browser, so no QuickBooks call is made. The assignments are real: the page writes
 * EventTypeQboServices through the signed-in client, so the connection the fake lists must exist in
 * QboConnections (it is made for the run and deleted after it; the delete cascades to the rows).
 */

export const ITEMS = [
  {
    id: "e2e-item-city",
    name: "Bleacher Rental - City",
    fullyQualifiedName: "Bleacher Rental - City",
    type: "Service",
  },
  {
    id: "e2e-item-rural",
    name: "Bleacher Rental - Rural",
    fullyQualifiedName: "Bleacher Rental - Rural",
    type: "Service",
  },
];

export function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export type E2eConnection = { id: string; display_name: string };

export async function createConnection(): Promise<E2eConnection> {
  const display_name = `E2E Quote Types ${Math.floor(Math.random() * 1_000_000)}`;
  const { data, error } = await serviceRole()
    .from("QboConnections")
    .insert({ display_name, encrypted_token_value: "__pending__" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`createConnection failed: ${error?.message}`);
  return { id: data.id as string, display_name };
}

/** Deleting the connection deletes its assignments (ON DELETE CASCADE). */
export async function deleteConnection(id: string) {
  const { error } = await serviceRole().from("QboConnections").delete().eq("id", id);
  if (error) throw new Error(`deleteConnection failed: ${error.message}`);
}

/** The oldest type with that name: a local database holds each seeded type twice. */
export async function eventTypeId(name: string): Promise<string> {
  const { data, error } = await serviceRole()
    .from("EventTypes")
    .select("id")
    .eq("name", name)
    .eq("deleted", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`No quote type named ${name}: ${error?.message}`);
  return data.id as string;
}

/** The fake lists only the run's own connection, and the two Items above. */
export async function fakeQuickBooks(page: Page, connection: E2eConnection) {
  await page.route("**/api/quickbooks/connections", (route) =>
    route.fulfill({
      json: {
        connections: [
          {
            id: connection.id,
            display_name: connection.display_name,
            realm_id: null,
            qbo_tax_code_id: null,
            qbo_no_tax_code_id: null,
            currency: "USD",
          },
        ],
      },
    }),
  );
  await page.route("**/api/quickbooks/items*", (route) =>
    route.fulfill({ json: { items: ITEMS } }),
  );
}

export const rowOf = (page: Page, typeId: string, connectionId: string): Locator =>
  page.getByTestId(`quote-type-row-${typeId}-${connectionId}`);

export async function pick(page: Page, row: Locator, label: string) {
  await row.getByRole("combobox").click();
  await page.getByRole("option", { name: label }).click();
}
