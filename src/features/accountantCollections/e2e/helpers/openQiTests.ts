import { test, expect, type Page } from "@playwright/test";
import { cleanupBookings, createOverdueBooking, type SeededBooking } from "./collectionsFixtures";

/**
 * The Open Q/I link in the header of the invoice page (docs/specs/accountant-collections-17-open-qi-button.md
 * §4, S49 and S50), written once and run as the accountant and as the administrator by
 * `openQi.accountant.spec.ts` and `openQi.admin.spec.ts`.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end.
 */

const stamp = Date.now();

export function defineOpenQiTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  async function seed(suffix: string) {
    const booking = await createOverdueBooking({
      name: `E2E Open QI ${role} ${suffix} ${stamp}`,
      taskDueInDays: 0,
    });
    seeded.push(booking);
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  const openQi = (page: Page) => page.getByRole("link", { name: "Open Q/I" });
  const openPdf = (page: Page) =>
    page.getByRole("link", { name: "Open PDF" }).or(page.getByRole("button", { name: "Open PDF" }));
  const view = (page: Page) => page.getByRole("button", { name: "Customer view" });

  async function open(page: Page, booking: SeededBooking, query = "") {
    await page.goto(`/accountant/invoice?id=${booking.eventId}${query}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  test.describe(`Open Q/I (${role})`, () => {
    test("S49: the header has Open Q/I before Open PDF, a link to the quote card that opens in a new tab; it is there in Customer view too", async ({
      page,
    }) => {
      const booking = await seed("header");

      await open(page, booking);
      await expect(openQi(page)).toBeVisible();
      await expect(openQi(page)).toHaveAttribute("href", `/quotes-bookings/${booking.eventId}`);
      await expect(openQi(page)).toHaveAttribute("target", "_blank");
      await expect(openQi(page)).toHaveAttribute("rel", /noopener/);

      // The first button of the group: it stands left of Open PDF.
      const qi = await openQi(page).boundingBox();
      const pdf = await openPdf(page).boundingBox();
      expect(qi).not.toBeNull();
      expect(pdf).not.toBeNull();
      expect(qi!.x).toBeLessThan(pdf!.x);

      // Customer view keeps it, with the same address.
      await view(page).click();
      await expect(view(page)).toHaveAttribute("aria-pressed", "true");
      await expect(openQi(page)).toBeVisible();
      await expect(openQi(page)).toHaveAttribute("href", `/quotes-bookings/${booking.eventId}`);
    });

    test("S50: a click opens the quote card of the same event in a new tab; the invoice page stays with its tab and list state", async ({
      page,
      context,
    }) => {
      const booking = await seed("click");
      const query = "&tab=messages&csort=amount&cdir=desc&cnotdue=1";

      await open(page, booking, query);
      await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      const popup = context.waitForEvent("page");
      await openQi(page).click();
      const opened = await popup;
      await expect(opened).toHaveURL(new RegExp(`/quotes-bookings/${booking.eventId}$`), {
        timeout: 60_000,
      });
      // Cut off from the invoice page (rel="noopener").
      expect(await opened.evaluate(() => window.opener === null)).toBe(true);

      // The invoice page is where it was.
      await expect(page).toHaveURL(new RegExp(`/accountant/invoice\\?id=${booking.eventId}`));
      const params = new URL(page.url()).searchParams;
      expect(Object.fromEntries(params)).toMatchObject({
        id: booking.eventId,
        tab: "messages",
        csort: "amount",
        cdir: "desc",
        cnotdue: "1",
      });
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible();
      await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });
}
