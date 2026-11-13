import { test, expect, type Locator, type Page } from "@playwright/test";
import { cleanupBookings, createOverdueBooking, type SeededBooking } from "./collectionsFixtures";

/**
 * Previous Task / Next Task beside the page (docs/specs/accountant-collections-22-side-task-buttons.md
 * §4, S69 to S71), written once and run as the accountant and as the administrator by
 * `sideTaskButtons.accountant.spec.ts` and `sideTaskButtons.admin.spec.ts`.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end. The amounts are consecutive cents and larger than
 * those of the other Collections specs, so the seeded events sit next to each other, at the top of
 * an amount order; the two roles use different ranges, and, like the earlier Previous / Next Task
 * scenarios (S13, S14), the first / last checks assume the two role projects do not run at the same
 * time.
 *
 * The page's box is the window minus the 224 px sidebar and the 32 px of padding, and the side
 * buttons need 1408 px of it: a 1440 px window gives 1184 px (none), an 1800 px window gives 1544 px
 * (both).
 */

const stamp = Date.now();
const NARROW = { width: 1440, height: 600 };
const WIDE = { width: 1800, height: 600 };

export function defineSideTaskButtonsTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];
  const base = role === "accountant" ? 9_300_000 : 9_310_000;

  /** Three events one cent apart: `big` first in a largest-first order, `small` last. */
  async function seedThree(suffix: string) {
    const make = async (label: string, cents: number) => {
      const booking = await createOverdueBooking({
        name: `E2E Side buttons ${role} ${suffix} ${label} ${stamp}`,
        taskDueInDays: 0,
        valueCents: cents,
      });
      seeded.push(booking);
      return booking;
    };
    return {
      big: await make("big", base + 3),
      mid: await make("mid", base + 2),
      small: await make("small", base + 1),
    };
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  const DESC = "&tab=info&csort=amount&cdir=desc";
  const ASC = "&tab=info&csort=amount&cdir=asc";

  /** The two rails are the only elements hidden from assistive technology that hold these labels. */
  const rail = (page: Page, label: "Previous Task" | "Next Task") =>
    page.locator('div[aria-hidden="true"]').filter({ hasText: label });
  /** What stands in a rail: the link, or the dimmed stand-in. */
  const sideButton = (page: Page, label: "Previous Task" | "Next Task") =>
    rail(page, label).locator("a, span[aria-disabled]");
  /** The button at the bottom of the page: the accessible one (the rails are aria-hidden). */
  const bottom = (page: Page, label: "Previous Task" | "Next Task") =>
    page.getByRole("link", { name: label });
  const column = (page: Page) =>
    page.getByRole("link", { name: "Back to tasks" }).locator("xpath=..");
  const customerView = (page: Page) => page.getByRole("button", { name: "Customer view" });

  async function open(page: Page, booking: SeededBooking, query: string) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}${query}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  const box = async (locator: Locator) => {
    const found = await locator.boundingBox();
    expect(found).not.toBeNull();
    return found!;
  };

  test.describe(`Side Previous Task / Next Task (${role})`, () => {
    test("S69: in an 1800 px window both side buttons stand outside the column, stay in view while the page scrolls, and the bottom buttons are there too", async ({
      page,
    }) => {
      const { mid } = await seedThree("wide");
      await page.setViewportSize(WIDE);

      await open(page, mid, DESC);
      await expect(rail(page, "Previous Task")).toBeVisible();
      await expect(rail(page, "Next Task")).toBeVisible();

      // Outside the column: the left one ends where the column starts, the right one starts after it.
      const col = await box(column(page));
      const left = await box(sideButton(page, "Previous Task"));
      const right = await box(sideButton(page, "Next Task"));
      expect(left.x + left.width).toBeLessThanOrEqual(col.x);
      expect(right.x).toBeGreaterThanOrEqual(col.x + col.width);
      expect(left.width).toBeCloseTo(168, 0);
      expect(left.height).toBeCloseTo(48, 0);

      // The bottom buttons stay: one link each for assistive technology, and the rail is the second.
      await expect(bottom(page, "Previous Task")).toHaveCount(1);
      await expect(bottom(page, "Next Task")).toHaveCount(1);
      await expect(
        page.getByRole("link", { name: "Previous Task", includeHidden: true }),
      ).toHaveCount(2);
      await expect(page.getByRole("link", { name: "Next Task", includeHidden: true })).toHaveCount(
        2,
      );

      // Scroll the page: the buttons follow, 24 px below the top of the scrolling area.
      const main = page.locator("main");
      await main.evaluate((el) => el.scrollTo(0, 600));
      expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
      await expect(sideButton(page, "Previous Task")).toBeInViewport();
      await expect(sideButton(page, "Next Task")).toBeInViewport();
      const area = await box(main);
      expect((await box(sideButton(page, "Previous Task"))).y).toBeCloseTo(area.y + 24, 0);
      expect((await box(sideButton(page, "Next Task"))).y).toBeCloseTo(area.y + 24, 0);
    });

    test("S70: in a 1440 px window there are no side buttons; widening to 1800 px adds them and narrowing removes them, with no reload", async ({
      page,
    }) => {
      const { mid } = await seedThree("resize");
      await page.setViewportSize(NARROW);

      await open(page, mid, DESC);
      await expect(rail(page, "Previous Task")).toHaveCount(0);
      await expect(rail(page, "Next Task")).toHaveCount(0);
      await expect(bottom(page, "Previous Task")).toBeVisible();
      await expect(bottom(page, "Next Task")).toBeVisible();

      // The same document throughout: a marker set on it survives all three sizes.
      await page.evaluate(() => {
        (window as unknown as { __sideButtonsMarker: number }).__sideButtonsMarker = 1;
      });

      await page.setViewportSize(WIDE);
      await expect(rail(page, "Previous Task")).toBeVisible();
      await expect(rail(page, "Next Task")).toBeVisible();

      await page.setViewportSize(NARROW);
      await expect(rail(page, "Previous Task")).toHaveCount(0);
      await expect(rail(page, "Next Task")).toHaveCount(0);
      await expect(bottom(page, "Previous Task")).toBeVisible();
      await expect(bottom(page, "Next Task")).toBeVisible();

      expect(
        await page.evaluate(
          () => (window as unknown as { __sideButtonsMarker?: number }).__sideButtonsMarker,
        ),
      ).toBe(1);
    });

    test("S71: a side button goes where the same bottom button goes (event, tab and list state); the edges are dimmed on both; Customer view hides the side buttons", async ({
      page,
    }) => {
      const { big, mid, small } = await seedThree("targets");
      await page.setViewportSize(WIDE);

      // Same destinations: the two hrefs are equal, and carry the tab and the list state.
      await open(page, mid, "&tab=messages&csort=amount&cdir=desc&cnotdue=1");
      for (const label of ["Previous Task", "Next Task"] as const) {
        const href = await sideButton(page, label).getAttribute("href");
        expect(href).not.toBeNull();
        expect(href).toBe(await bottom(page, label).getAttribute("href"));
        expect(Object.fromEntries(new URL(href!, page.url()).searchParams)).toMatchObject({
          tab: "messages",
          csort: "amount",
          cdir: "desc",
          cnotdue: "1",
        });
        // Out of the tab order.
        await expect(sideButton(page, label)).toHaveAttribute("tabindex", "-1");
      }
      expect(await sideButton(page, "Next Task").getAttribute("href")).toContain(
        `id=${small.eventId}`,
      );
      expect(await sideButton(page, "Previous Task").getAttribute("href")).toContain(
        `id=${big.eventId}`,
      );

      // A click on the side button goes there, as the bottom one does.
      await sideButton(page, "Next Task").click();
      await expect(page).toHaveURL(new RegExp(`id=${small.eventId}`));
      const params = new URL(page.url()).searchParams;
      expect(params.get("tab")).toBe("messages");
      expect(params.get("csort")).toBe("amount");
      expect(params.get("cdir")).toBe("desc");
      await expect(page.getByRole("heading", { name: small.name })).toBeVisible();

      // The first event of a largest-first order: Previous is dimmed on both, Next is a link on both.
      await open(page, big, DESC);
      await expect(sideButton(page, "Previous Task")).toHaveAttribute("aria-disabled", "true");
      await expect(sideButton(page, "Previous Task")).not.toHaveAttribute("href");
      await expect(bottom(page, "Previous Task")).toHaveAttribute("aria-disabled", "true");
      await expect(sideButton(page, "Next Task")).toHaveAttribute("href", /.+/);
      await expect(bottom(page, "Next Task")).toHaveAttribute("href", /.+/);

      // The last event of a smallest-first order (the largest amount): Next is dimmed on both.
      await open(page, big, ASC);
      await expect(sideButton(page, "Next Task")).toHaveAttribute("aria-disabled", "true");
      await expect(sideButton(page, "Next Task")).not.toHaveAttribute("href");
      await expect(bottom(page, "Next Task")).toHaveAttribute("aria-disabled", "true");
      await expect(sideButton(page, "Previous Task")).toHaveAttribute("href", /.+/);
      await expect(bottom(page, "Previous Task")).toHaveAttribute("href", /.+/);

      // Customer view hides the bottom buttons, and the side ones with them.
      await open(page, mid, DESC);
      await expect(rail(page, "Previous Task")).toBeVisible();
      await customerView(page).click();
      await expect(customerView(page)).toHaveAttribute("aria-pressed", "true");
      await expect(rail(page, "Previous Task")).toHaveCount(0);
      await expect(rail(page, "Next Task")).toHaveCount(0);
      await expect(bottom(page, "Previous Task")).toHaveCount(0);
      await expect(bottom(page, "Next Task")).toHaveCount(0);

      // Switching it off brings them back.
      await customerView(page).click();
      await expect(customerView(page)).toHaveAttribute("aria-pressed", "false");
      await expect(rail(page, "Previous Task")).toBeVisible();
      await expect(rail(page, "Next Task")).toBeVisible();
    });
  });
}
