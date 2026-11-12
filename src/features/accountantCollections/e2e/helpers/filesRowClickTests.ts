import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  addEventFile,
  cleanupBookings,
  createOverdueBooking,
  type SeededBooking,
} from "./collectionsFixtures";

/**
 * The whole row of the Files table opens the file
 * (docs/specs/accountant-collections-21-files-row-click.md §4, S65 to S68), written once and run as
 * the accountant and as the administrator by `filesRowClick.accountant.spec.ts` and
 * `filesRowClick.admin.spec.ts`.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end. The rows reach the page by synchronisation, so
 * the checks wait up to 60 s.
 *
 * A signed link is a request to `/storage/v1/object/sign/event-files/<path>?token=…`. The tests
 * watch for that request instead of the popup's own address: whether a headless browser shows a
 * PDF in the tab or starts a download, the request is the same.
 */

const stamp = Date.now();
const SIGNED_LINK = /\/storage\/v1\/object\/sign\/event-files\/.+[?&]token=/;

export function defineFilesRowClickTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  async function seed(suffix: string) {
    const booking = await createOverdueBooking({
      name: `E2E Files Row ${role} ${suffix} ${stamp}`,
      taskDueInDays: 0,
    });
    seeded.push(booking);
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  const files = (page: Page) => page.getByRole("region", { name: "Files" });
  const rowOf = (page: Page, name: string) =>
    files(page).getByRole("row", { name: new RegExp(name.replace(".", "\\.")) });

  async function open(page: Page, booking: SeededBooking) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  /** Counts the tabs the context opens from now on. */
  function countTabs(context: BrowserContext) {
    const state = { opened: 0 };
    context.on("page", () => {
      state.opened += 1;
    });
    return state;
  }

  const invoiceUrl = (booking: SeededBooking) =>
    new RegExp(`/accountant/invoice\\?id=${booking.eventId}$`);

  test.describe(`Files row click (${role})`, () => {
    test("S65: a click on a row, away from its buttons, opens the file in a new tab; the invoice page stays on the same event and tab", async ({
      page,
      context,
    }) => {
      const booking = await seed("row");
      await addEventFile(booking.eventId, { name: "Check_Scan.pdf", source: "upload" });
      await addEventFile(booking.eventId, { name: "Quote.pdf", source: "sent_quote" });

      await open(page, booking);
      await expect(rowOf(page, "Check_Scan.pdf")).toBeVisible({ timeout: 60_000 });
      const urlBefore = page.url();

      const popup = context.waitForEvent("page");
      const signed = context.waitForEvent("request", (request) => SIGNED_LINK.test(request.url()));
      // The Type cell: grey space of the row, not the name and not a button.
      await rowOf(page, "Check_Scan.pdf").getByRole("cell").nth(2).click();
      await popup;
      expect((await signed).url()).toContain("/object/sign/event-files/");
      expect((await signed).url()).toContain(`${booking.eventId}/`);

      // The invoice page is where it was.
      expect(page.url()).toBe(urlBefore);
      await expect(page).toHaveURL(invoiceUrl(booking));
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible();
    });

    test("S66: the Download icon starts a download with the file's name and opens no tab; the page's address does not change", async ({
      page,
      context,
    }) => {
      const booking = await seed("download");
      await addEventFile(booking.eventId, { name: "Check_Scan.pdf", source: "upload" });

      await open(page, booking);
      await expect(rowOf(page, "Check_Scan.pdf")).toBeVisible({ timeout: 60_000 });
      const urlBefore = page.url();
      const tabs = countTabs(context);

      const download = page.waitForEvent("download");
      await files(page).getByRole("button", { name: "Download Check_Scan.pdf" }).click();
      expect((await download).suggestedFilename()).toBe("Check_Scan.pdf");

      expect(tabs.opened).toBe(0);
      expect(page.url()).toBe(urlBefore);
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible();
    });

    test("S67: Delete and its Cancel open no tab; with the keyboard Tab reaches the name and Enter opens the file; the row shows the focus ring", async ({
      page,
      context,
    }) => {
      const booking = await seed("keyboard");
      await addEventFile(booking.eventId, { name: "Check_Scan.pdf", source: "upload" });

      await open(page, booking);
      await expect(rowOf(page, "Check_Scan.pdf")).toBeVisible({ timeout: 60_000 });
      const tabs = countTabs(context);

      // Delete is above the row's overlay: it asks, and nothing opens, not even when cancelled.
      await files(page).getByRole("button", { name: "Delete Check_Scan.pdf" }).click();
      const dialog = page.getByRole("alertdialog", { name: "Delete file?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).toBeHidden();
      expect(tabs.opened).toBe(0);
      await expect(rowOf(page, "Check_Scan.pdf")).toBeVisible();

      // From Attach File, one Tab reaches the name button: the row's only Tab stop before its icons.
      await files(page).getByRole("button", { name: "Attach File" }).focus();
      await page.keyboard.press("Tab");
      const name = files(page).getByRole("button", { name: "Check_Scan.pdf", exact: true });
      await expect(name).toBeFocused();
      await expect(name).toHaveAttribute("title", "Opens the file in a new tab");

      // The 2 px blue ring is drawn around the whole row, by the overlay of the focused button.
      const ring = await name.evaluate((el) => {
        const style = getComputedStyle(el, "::after");
        return { style: style.outlineStyle, width: style.outlineWidth };
      });
      expect(ring).toEqual({ style: "solid", width: "2px" });

      const popup = context.waitForEvent("page");
      const signed = context.waitForEvent("request", (request) => SIGNED_LINK.test(request.url()));
      await page.keyboard.press("Enter");
      await popup;
      expect((await signed).url()).toContain("/object/sign/event-files/");
      await expect(page).toHaveURL(invoiceUrl(booking));
    });

    test("S68: a row with no storage path is not clickable and its two buttons are disabled", async ({
      page,
      context,
    }) => {
      const booking = await seed("no-path");
      // The column is NOT NULL, so an empty path stands for "no path".
      await addEventFile(booking.eventId, {
        name: "No_Path.pdf",
        source: "upload",
        storagePath: "",
      });

      await open(page, booking);
      const row = rowOf(page, "No_Path.pdf");
      await expect(row).toBeVisible({ timeout: 60_000 });
      const tabs = countTabs(context);

      // The name is plain text, not a button.
      await expect(
        files(page).getByRole("button", { name: "No_Path.pdf", exact: true }),
      ).toHaveCount(0);
      await expect(
        files(page).getByRole("button", { name: "Download No_Path.pdf" }),
      ).toBeDisabled();
      await expect(files(page).getByRole("button", { name: "Delete No_Path.pdf" })).toBeDisabled();

      // No hand over the row, and a click on it opens nothing.
      expect(await row.evaluate((el) => getComputedStyle(el).cursor)).not.toBe("pointer");
      await row.getByRole("cell").nth(2).click();
      expect(tabs.opened).toBe(0);
      await expect(page).toHaveURL(invoiceUrl(booking));
    });
  });
}
