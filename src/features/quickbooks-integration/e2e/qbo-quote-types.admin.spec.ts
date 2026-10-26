import { test, expect } from "@playwright/test";
import {
  createConnection,
  deleteConnection,
  eventTypeId,
  fakeQuickBooks,
  pick,
  rowOf,
  serviceRole,
  type E2eConnection,
} from "./helpers/quoteTypes";

// docs/specs/qbo-invoice-12a-quote-types-page.md §5 (S1, S2, S3) and
// docs/specs/qbo-invoice-12c-manage-quote-types.md §5 (S7 to S11), as an administrator.
// Written, not run locally (standing instruction: no Playwright runs on this machine).

const LOAD = { timeout: 60_000 };

test.describe("Quote Types page (admin)", () => {
  let connection: E2eConnection;
  let cityId: string;

  test.beforeAll(async () => {
    connection = await createConnection();
    cityId = await eventTypeId("City");
  });

  test.afterAll(async () => {
    await deleteConnection(connection.id);
  });

  test.beforeEach(async ({ page }) => {
    await fakeQuickBooks(page, connection);
  });

  test("S1: Configuration lists Quote Types, and the page shows a card per type and a row per connection", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Configuration" }).click();
    await page.getByRole("link", { name: "Quote Types" }).click();

    await expect(page).toHaveURL(/\/qbo-quote-types/);
    await expect(page.getByRole("heading", { name: "Quote Types" })).toBeVisible();
    await expect(page.getByTestId(`quote-type-${cityId}`)).toBeVisible(LOAD);
    await expect(rowOf(page, cityId, connection.id)).toContainText(connection.display_name);
  });

  test("S2: a picked Product/Service survives a reload, and picking it again clears it", async ({
    page,
  }) => {
    await page.goto("/qbo-quote-types");
    const row = rowOf(page, cityId, connection.id);
    await expect(row).toBeVisible(LOAD);

    await pick(page, row, "Bleacher Rental - City");
    await expect(row.getByRole("combobox")).toContainText("Bleacher Rental - City");

    await page.reload();
    await expect(rowOf(page, cityId, connection.id).getByRole("combobox")).toContainText(
      "Bleacher Rental - City",
      LOAD,
    );

    await pick(page, rowOf(page, cityId, connection.id), "Bleacher Rental - City");
    await expect(rowOf(page, cityId, connection.id).getByRole("combobox")).toContainText(
      "Select QuickBooks Product/Service...",
    );

    await page.reload();
    await expect(rowOf(page, cityId, connection.id).getByRole("combobox")).toContainText(
      "Select QuickBooks Product/Service...",
      LOAD,
    );
  });

  test("S3: a failed save shows the error toast and puts the old value back", async ({ page }) => {
    // Only the writes fail; the page still reads its assignments.
    await page.route("**/rest/v1/EventTypeQboServices*", (route) =>
      route.request().method() === "GET"
        ? route.continue()
        : route.fulfill({ status: 403, json: { code: "42501", message: "permission denied" } }),
    );
    await page.goto("/qbo-quote-types");
    const row = rowOf(page, cityId, connection.id);
    await expect(row).toBeVisible(LOAD);

    await pick(page, row, "Bleacher Rental - City");

    await expect(page.getByText("Failed to save the Product/Service for City")).toBeVisible();
    await expect(row.getByRole("combobox")).toContainText("Select QuickBooks Product/Service...");
  });
});

// docs/specs/qbo-invoice-12c-manage-quote-types.md §5. The writes go through PowerSync, so what
// reaches the server is polled with the service role. A type a scenario makes is removed after it.
test.describe("Managing the quote types (admin)", () => {
  const NAME = `E2E Type ${Math.floor(Math.random() * 1_000_000)}`;
  const RENAMED = `${NAME} renamed`;
  let usedTypeId: string;

  const rowsNamed = async (name: string) => {
    const { data } = await serviceRole().from("EventTypes").select("id, deleted").eq("name", name);
    return data ?? [];
  };

  test.beforeAll(async () => {
    usedTypeId = await eventTypeId("City");
  });

  test.afterEach(async () => {
    const db = serviceRole();
    for (const name of [NAME, RENAMED]) await db.from("EventTypes").delete().eq("name", name);
  });

  test("S7: Add quote type creates a card, and the type reaches the server", async ({ page }) => {
    await page.goto("/qbo-quote-types");
    await expect(page.getByTestId(`quote-type-${usedTypeId}`)).toBeVisible(LOAD);

    await page.getByTestId("add-quote-type").click();
    await page.getByTestId("add-quote-type-input").fill(NAME);
    await page.getByTestId("add-quote-type-submit").click();

    await expect(page.getByText(NAME, { exact: true })).toBeVisible();
    await expect(page.getByTestId("add-quote-type-input")).toHaveCount(0);
    await expect.poll(async () => (await rowsNamed(NAME)).length, LOAD).toBe(1);
  });

  test("S8: Rename changes the name, here and on the server", async ({ page }) => {
    await page.goto("/qbo-quote-types");
    await page.getByTestId("add-quote-type").click();
    await page.getByTestId("add-quote-type-input").fill(NAME);
    await page.getByTestId("add-quote-type-submit").click();
    await expect.poll(async () => (await rowsNamed(NAME)).length, LOAD).toBe(1);
    const [{ id }] = await rowsNamed(NAME);

    await page.getByTestId(`rename-quote-type-${id}`).click();
    await page.getByTestId(`rename-quote-type-input-${id}`).fill(RENAMED);
    await page.getByTestId(`rename-quote-type-save-${id}`).click();

    await expect(page.getByTestId(`quote-type-${id}`)).toContainText(RENAMED);
    await expect.poll(async () => (await rowsNamed(RENAMED)).length, LOAD).toBe(1);
  });

  test("S9: Delete on a type nothing uses asks first, then removes the card", async ({ page }) => {
    await page.goto("/qbo-quote-types");
    await page.getByTestId("add-quote-type").click();
    await page.getByTestId("add-quote-type-input").fill(NAME);
    await page.getByTestId("add-quote-type-submit").click();
    await expect.poll(async () => (await rowsNamed(NAME)).length, LOAD).toBe(1);
    const [{ id }] = await rowsNamed(NAME);

    await page.getByTestId(`delete-quote-type-${id}`).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(`Delete quote type ${NAME}?`);
    await expect(page.getByTestId(`quote-type-${id}`)).toBeVisible();
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByTestId(`quote-type-${id}`)).toHaveCount(0);
    await expect.poll(async () => (await rowsNamed(NAME))[0]?.deleted, LOAD).toBe(true);
  });

  test("S10: Delete on a type that quotes and prices use shows the toast and asks nothing", async ({
    page,
  }) => {
    await page.goto("/qbo-quote-types");
    await expect(page.getByTestId(`quote-type-${usedTypeId}`)).toBeVisible(LOAD);

    await page.getByTestId(`delete-quote-type-${usedTypeId}`).click();

    await expect(
      page.getByText("City is used by quotes or prices, so it cannot be deleted."),
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByTestId(`quote-type-${usedTypeId}`)).toBeVisible();
  });

  test("S11: a blank name shows the toast, adds nothing and keeps the field open", async ({
    page,
  }) => {
    await page.goto("/qbo-quote-types");
    await expect(page.getByTestId(`quote-type-${usedTypeId}`)).toBeVisible(LOAD);

    await page.getByTestId("add-quote-type").click();
    await page.getByTestId("add-quote-type-input").fill("   ");
    await page.getByTestId("add-quote-type-submit").click();

    await expect(page.getByText("Enter a name for the quote type.")).toBeVisible();
    await expect(page.getByTestId("add-quote-type-input")).toBeVisible();
  });
});
