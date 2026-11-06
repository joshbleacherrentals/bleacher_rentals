import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import {
  activeSignaturesOf,
  addContractTerms,
  addFrenchContact,
  cleanupBookings,
  clientActivityOf,
  createOverdueBooking,
  type SeededBooking,
} from "./collectionsFixtures";

/**
 * The Customer view button on the invoice page (docs/specs/accountant-collections-16-customer-page-view.md
 * §4, S41–S48), written once and run as the accountant and as the administrator by
 * `customerPageView.accountant.spec.ts` and `customerPageView.admin.spec.ts`.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end. Stripe and the stored PDFs are stubbed by the
 * test, so nothing real is charged and no PDF is rendered.
 */

const stamp = Date.now();

export function defineCustomerPageViewTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  async function seed(
    suffix: string,
    options: Omit<Parameters<typeof createOverdueBooking>[0], "name">,
  ) {
    const booking = await createOverdueBooking({
      name: `E2E Customer view ${role} ${suffix} ${stamp}`,
      ...options,
    });
    seeded.push(booking);
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  const frameElement = (page: Page) => page.locator('iframe[title="Customer page"]');
  const frame = (page: Page) => page.frameLocator('iframe[title="Customer page"]');
  const view = (page: Page) => page.getByRole("button", { name: "Customer view" });
  const customerTab = (page: Page, name: string) =>
    page.getByRole("tablist", { name: "Customer page sections" }).getByRole("tab", { name });
  const nextLink = (page: Page) => page.getByRole("link", { name: "Next Task" });
  const newTask = (page: Page) => page.getByRole("button", { name: "New Task", exact: true });
  const newTaskWindow = (page: Page) => page.getByRole("dialog", { name: "New Task" });

  async function open(page: Page, booking: SeededBooking, query = "") {
    await page.goto(`/accountant/invoice?id=${booking.eventId}${query}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  async function switchOn(page: Page) {
    await view(page).click();
    await expect(view(page)).toHaveAttribute("aria-pressed", "true");
    await expect(frameElement(page)).toBeVisible();
    // The customer's page itself: its first tab, in English.
    await expect(frame(page).getByText("Event Information")).toBeVisible({ timeout: 60_000 });
  }

  /** Answers the stored signed PDF with a stub and records the addresses asked for. */
  async function stubSignedPdf(context: BrowserContext) {
    const asked: string[] = [];
    await context.route(/\/storage\/v1\/object\/sign\/contracts\//, (route) => {
      asked.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 e2e" });
    });
    return asked;
  }

  test.describe(`Customer view button (${role})`, () => {
    test(`S41: the button is not pressed by default; pressed it shows the three customer tabs and the frame, keeps the header's buttons and hides the footer; off returns`, async ({
      page,
    }) => {
      const booking = await seed("toggle", { taskDueInDays: 0 });

      await open(page, booking);
      await expect(view(page)).toHaveAttribute("aria-pressed", "false");
      await expect(page.getByRole("tab", { name: "Information" })).toBeVisible();
      await expect(newTask(page)).toBeVisible();
      await expect(nextLink(page)).toBeVisible();
      await expect(frameElement(page)).toHaveCount(0);

      await switchOn(page);
      await expect(page.getByRole("tab")).toHaveText([
        "Approved Quote",
        "Signed Contract",
        "Pay Invoice",
      ]);
      await expect(customerTab(page, "Approved Quote")).toHaveAttribute("aria-selected", "true");
      // The header keeps its buttons, its status and its name.
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible();
      await expect(page.getByRole("button", { name: "Record Payment" })).toBeVisible();
      await expect(
        page
          .getByRole("link", { name: "Open PDF" })
          .or(page.getByRole("button", { name: "Open PDF" })),
      ).toBeVisible();
      await expect(page.getByText("Collections", { exact: true })).toBeVisible();
      // The footer and the New Task button are not in the customer view.
      await expect(nextLink(page)).toHaveCount(0);
      await expect(newTask(page)).toHaveCount(0);

      await view(page).click();
      await expect(view(page)).toHaveAttribute("aria-pressed", "false");
      await expect(frameElement(page)).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Information" })).toBeVisible();
      await expect(nextLink(page)).toBeVisible();
      await expect(newTask(page)).toBeVisible();
    });

    test("S42: each customer tab shows its page in the frame, bare and in English; nothing in the frame scrolls", async ({
      page,
    }) => {
      const booking = await seed("tabs", { taskDueInDays: 0 });
      await addContractTerms(booking.eventId);
      // The customer's own link would be French; the accountant's frame is English all the same.
      await addFrenchContact(booking.eventId);

      await open(page, booking);
      await switchOn(page);
      const inFrame = frame(page);

      // No tab bar of its own and no language switch.
      await expect(inFrame.getByRole("button", { name: "Pay Invoice" })).toHaveCount(0);
      await expect(inFrame.getByRole("button", { name: "Quote language" })).toHaveCount(0);
      await expect(inFrame.getByText("Download PDF")).toBeVisible();
      await expect(inFrame.getByText("Devis")).toHaveCount(0);
      // Not the app inside the frame, and not sent to /accountant.
      await expect(inFrame.getByRole("tab", { name: "Collections" })).toHaveCount(0);
      await expect(inFrame.getByRole("link", { name: "Previous Task" })).toHaveCount(0);
      const frameUrl = page
        .frames()
        .map((f) => f.url())
        .find((url) => url.includes("/quote/"));
      expect(frameUrl).toContain(`/quote/${booking.eventId}`);

      await customerTab(page, "Signed Contract").click();
      await expect(customerTab(page, "Signed Contract")).toHaveAttribute("aria-selected", "true");
      await expect(inFrame.getByText("E2E terms")).toBeVisible();

      await customerTab(page, "Pay Invoice").click();
      await expect(inFrame.getByText("Your Name *")).toBeVisible();

      await customerTab(page, "Approved Quote").click();
      await expect(inFrame.getByText("Event Information")).toBeVisible();

      // The frame is as tall as its page, so only the invoice page scrolls.
      const frameScrolls = await frameElement(page).evaluate((el) => {
        const doc = (el as HTMLIFrameElement).contentDocument;
        const box = doc?.querySelector<HTMLElement>("div.overflow-y-auto");
        return box ? box.scrollHeight > box.clientHeight + 1 : null;
      });
      expect(frameScrolls).toBe(false);
    });

    test("S43: opening the frame writes nothing to the activity log and raises no pop-up", async ({
      page,
    }) => {
      const booking = await seed("log", { taskDueInDays: 0 });
      expect(await clientActivityOf(booking.eventId)).toEqual([]);

      await open(page, booking);
      await switchOn(page);
      for (const name of ["Signed Contract", "Pay Invoice", "Approved Quote"]) {
        await customerTab(page, name).click();
      }
      await page.waitForTimeout(3_000);

      expect(await clientActivityOf(booking.eventId)).toEqual([]);
      await expect(frame(page).getByText("Are you still here?")).toHaveCount(0);
      await expect(frame(page).getByText("This quote has been updated")).toHaveCount(0);

      // The same for the address opened directly, with the idle time of the page shortened.
      await page.goto(`/quote/${booking.eventId}?embed=1&idleMs=1500`);
      await expect(page.getByRole("button", { name: "Pay Invoice" })).toBeVisible({
        timeout: 60_000,
      });
      await page.waitForTimeout(4_000);
      expect(await clientActivityOf(booking.eventId)).toEqual([]);
      await expect(page.getByText("Are you still here?")).toHaveCount(0);
    });

    test("S44: Sign in the frame signs, the status follows the sync, and Open PDF opens the signed file", async ({
      page,
      context,
    }) => {
      const booking = await seed("sign", {
        taskDueInDays: 0,
        status: "quoted",
        withOpenTask: false,
      });
      await addContractTerms(booking.eventId);
      const asked = await stubSignedPdf(context);

      await open(page, booking);
      await expect(page.getByText("Not active yet", { exact: true })).toBeVisible();
      await switchOn(page);
      await customerTab(page, "Signed Contract").click();

      await frame(page).getByPlaceholder("Full name").fill("E2E Signer");
      await frame(page).getByRole("button", { name: "Sign Contract" }).click();

      await expect.poll(() => activeSignaturesOf(booking.eventId), { timeout: 60_000 }).toBe(1);
      await expect(page.getByText("Not active yet", { exact: true })).toHaveCount(0, {
        timeout: 60_000,
      });

      const openPdf = page.getByRole("button", { name: "Open PDF" });
      await expect(openPdf).toBeVisible({ timeout: 60_000 });
      const popup = context.waitForEvent("page");
      await openPdf.click();
      await popup;
      expect(asked.some((url) => url.includes("/storage/v1/object/sign/contracts/"))).toBe(true);
    });

    test("S45: Pay in the frame opens a new tab and the invoice page stays", async ({
      page,
      context,
    }) => {
      const booking = await seed("pay", { taskDueInDays: 0 });
      await context.route("**/api/payments/create-checkout", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: "https://checkout.stripe.test/c/pay_e2e" }),
        }),
      );
      await context.route("https://checkout.stripe.test/**", (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: "<p>stub checkout</p>" }),
      );

      await open(page, booking);
      await switchOn(page);
      await customerTab(page, "Pay Invoice").click();
      await frame(page).getByPlaceholder("Full name").fill("E2E Payer");

      const popup = context.waitForEvent("page");
      await frame(page)
        .getByRole("button", { name: /^Pay .* Online$/ })
        .click();
      expect((await popup).url()).toContain("checkout.stripe.test");

      await expect(page).toHaveURL(new RegExp(`/accountant/invoice\\?id=${booking.eventId}`));
      await expect(view(page)).toHaveAttribute("aria-pressed", "true");
      await expect(customerTab(page, "Pay Invoice")).toHaveAttribute("aria-selected", "true");
    });

    test("S46: going to another event switches the view off; an open New Task window survives switching it on", async ({
      page,
    }) => {
      const first = await seed("nav-a", { taskDueInDays: 0, valueCents: 9_100_002 });
      const second = await seed("nav-b", { taskDueInDays: 0, valueCents: 9_100_001 });
      const query = "&tab=info&csort=amount&cdir=desc";

      await open(page, first, query);
      await nextLink(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${second.eventId}`));
      await expect(page.getByRole("heading", { name: second.name })).toBeVisible();

      await switchOn(page);
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`id=${first.eventId}`));
      await expect(page.getByRole("heading", { name: first.name })).toBeVisible();
      await expect(view(page)).toHaveAttribute("aria-pressed", "false");
      await page.goForward();
      await expect(page.getByRole("heading", { name: second.name })).toBeVisible();
      await expect(view(page)).toHaveAttribute("aria-pressed", "false");

      // The New Task window belongs to the page, not to a tab.
      await page.goto(`/accountant/invoice?id=${second.eventId}${query}`);
      await expect(page.getByRole("heading", { name: second.name })).toBeVisible({
        timeout: 60_000,
      });
      await newTask(page).click();
      await expect(newTaskWindow(page)).toBeVisible();
      await view(page).click();
      await expect(view(page)).toHaveAttribute("aria-pressed", "true");
      await expect(newTaskWindow(page)).toBeVisible();
    });

    test("S47: the address opened directly with embed=1 still shows the page's own tab bar", async ({
      page,
    }) => {
      const booking = await seed("direct", { taskDueInDays: 0 });

      await page.goto(`/quote/${booking.eventId}?embed=1`);
      for (const name of ["Approved Quote", "Signed Contract", "Pay Invoice"]) {
        await expect(page.getByRole("button", { name })).toBeVisible({ timeout: 60_000 });
      }
    });

    test("S48: the customer's page opens by its address and from Show Customer View, inside the app, with no redirect", async ({
      page,
      context,
    }) => {
      const booking = await seed("address", { taskDueInDays: 0 });

      await page.goto(`/quote/${booking.eventId}`);
      await expect(page.getByRole("button", { name: "Pay Invoice" })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page).toHaveURL(new RegExp(`/quote/${booking.eventId}$`));
      await expect(page.getByRole("tab", { name: "Collections" })).toHaveCount(0);

      await page.goto(`/quotes-bookings/${booking.eventId}`);
      const popup = context.waitForEvent("page");
      await page.getByRole("link", { name: "Show Customer View" }).click({ timeout: 60_000 });
      const opened = await popup;
      await expect(opened.getByRole("button", { name: "Pay Invoice" })).toBeVisible({
        timeout: 60_000,
      });
      await expect(opened).toHaveURL(new RegExp(`/quote/${booking.eventId}$`));
    });

    test("S48: a visitor who is not signed in sees the page as before", async ({ browser }) => {
      const booking = await seed("visitor", { taskDueInDays: 0 });
      const visitor = await browser.newContext();
      const visitorPage = await visitor.newPage();
      await visitorPage.goto(`/quote/${booking.eventId}`);
      for (const name of ["Approved Quote", "Signed Contract", "Pay Invoice"]) {
        await expect(visitorPage.getByRole("button", { name })).toBeVisible({ timeout: 60_000 });
      }
      await visitor.close();
    });
  });
}
