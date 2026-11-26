import { test, expect } from "@playwright/test";
import { formatPercent, formatUsd, formatUsdWhole } from "../utils/analyticsFormat";
import { convertCents } from "../utils/exchangeRates";
import {
  CAD_RATE,
  cardNote,
  cardValue,
  centsOf,
  chartOf,
  choosePeriod,
  expectWholePage,
  failRates,
  mockRates,
  openAnalytics,
  periodButton,
  periodOption,
  readyOf,
} from "./helpers/analyticsPage";
import {
  SERVICE_CAD,
  SERVICE_USD,
  SERVICE_USD_2,
  YEARS,
  expectedReady,
  expectedSpendCents,
  serviceTotal,
  withFixtures,
} from "./helpers/dashboardAnalyticsFixtures";

/**
 * The Dashboard & Analytics page as an administrator sees it. The database already holds repairs
 * and other specs seed theirs at the same time, so a total is never assumed: the spec waits until
 * the card equals the figure worked out from the database (the oracles of the fixtures), and the
 * scenarios that need an exact total seed into a year no real repair is in. The Frankfurter calls
 * are answered by `page.route`; no spec reaches the real API. Written, not run (project rule).
 * Spec: docs/specs/dashboard-analytics-05-page.md §6 (S6 to S10, S12).
 */

const POLL = { timeout: 60_000 };
const currentYear = () => new Date().getFullYear();

test.describe("Dashboard & Analytics (administrator)", () => {
  test.beforeEach(async ({ page }) => {
    await mockRates(page);
  });

  test("S6: shows the five cards, the four tables and the chart, and the total is the spend of the current year", async ({
    page,
  }) => {
    await withFixtures(async (fx) => {
      const year = currentYear();
      const bleacher = await fx.addBleacher();
      await fx.addRepair({ day: `${year}-03-10`, bleacher, services: [SERVICE_USD] });
      await fx.addRepair({ day: `${year}-04-11`, bleacher, services: [SERVICE_USD_2] });
      const seeded = serviceTotal(SERVICE_USD) + serviceTotal(SERVICE_USD_2);

      await openAnalytics(page);
      await expectWholePage(page);

      // The card equals the figure worked out from the database, and that figure holds our seeds.
      await expect
        .poll(
          async () =>
            centsOf(await cardValue(page, "total").textContent()) -
            (await expectedSpendCents(fx.supabase, { year }, CAD_RATE)),
          POLL,
        )
        .toBe(0);
      expect(await expectedSpendCents(fx.supabase, { year }, CAD_RATE)).toBeGreaterThanOrEqual(
        seeded,
      );

      // The caption names the number of live bleachers, ours included.
      await expect
        .poll(async () => {
          const { total } = await expectedReady(fx.supabase);
          return (
            (await cardNote(page, "total").textContent()) ===
            `${year} spend across ${total} bleachers`
          );
        }, POLL)
        .toBe(true);

      await expect(chartOf(page)).toBeVisible();
    });
  });

  test("S7: the dropdown lists the current year, an earlier year and All time, and every figure follows the choice", async ({
    page,
  }) => {
    await withFixtures(async (fx) => {
      const year = currentYear();
      const bleacher = await fx.addBleacher();
      await fx.addRepair({ day: `${year}-05-05`, bleacher, services: [SERVICE_USD] });
      await fx.addRepair({ day: `${YEARS.list}-05-05`, bleacher, services: [SERVICE_USD_2] });

      await openAnalytics(page);

      await periodButton(page).click();
      await expect(periodOption(page, String(year))).toBeVisible();
      await expect(periodOption(page, String(YEARS.list))).toBeVisible(POLL);
      await expect(periodOption(page, "All time")).toBeVisible();
      await page.keyboard.press("Escape");

      // The earlier year holds only our repair, so its total is exactly that repair.
      await choosePeriod(page, String(YEARS.list));
      await expect(cardValue(page, "total")).toHaveText(
        formatUsd(serviceTotal(SERVICE_USD_2)),
        POLL,
      );
      await expect
        .poll(async () => {
          const { total } = await expectedReady(fx.supabase);
          return (
            (await cardNote(page, "total").textContent()) ===
            `${YEARS.list} spend across ${total} bleachers`
          );
        }, POLL)
        .toBe(true);

      // All time is the sum of every year, ours included.
      await choosePeriod(page, "All time");
      await expect
        .poll(
          async () =>
            centsOf(await cardValue(page, "total").textContent()) -
            (await expectedSpendCents(fx.supabase, "all", CAD_RATE)),
          POLL,
        )
        .toBe(0);
      await expect
        .poll(
          async () =>
            ((await cardNote(page, "total").textContent()) ?? "").startsWith(
              "All-time spend across",
            ),
          POLL,
        )
        .toBe(true);
    });
  });

  test("S8: a repair that is not Completed holds its bleacher, Bleachers Ready ignores the period, and Completed gives the bleacher back", async ({
    page,
  }) => {
    await withFixtures(async (fx) => {
      const bleacher = await fx.addBleacher();
      await openAnalytics(page);

      /** Waits until the card equals the database, then returns what the database says. */
      const settle = async () => {
        let seen = { ready: -1, total: -1, busy: new Set<string>() };
        await expect
          .poll(async () => {
            seen = await expectedReady(fx.supabase);
            return (
              (await cardNote(page, "ready").textContent()) ===
              `${seen.ready} of ${seen.total} ready to go`
            );
          }, POLL)
          .toBe(true);
        return seen;
      };

      // A fresh bleacher with no repair is ready.
      const free = await settle();
      expect(free.busy.has(bleacher.uuid)).toBe(false);

      // An open repair on it makes it not ready.
      const repair = await fx.addRepair({
        day: `${currentYear()}-06-06`,
        bleacher,
        status: "inbound",
        services: [SERVICE_USD],
      });
      const held = await settle();
      expect(held.busy.has(bleacher.uuid)).toBe(true);

      // The card is about today: choosing another period does not move it.
      const before = await cardNote(page, "ready").textContent();
      await choosePeriod(page, "All time");
      await expect(cardNote(page, "ready")).toHaveText(before ?? "");
      expect(readyOf(before)?.total).toBeGreaterThan(0);

      // Completed gives the bleacher back.
      await fx.setStatus(repair.id, "completed");
      const back = await settle();
      expect(back.busy.has(bleacher.uuid)).toBe(false);
    });
  });

  test("S9: a CAD repair is converted at the rate of the API, to the cent, and the note says so", async ({
    page,
  }) => {
    await withFixtures(async (fx) => {
      const bleacher = await fx.addBleacher();
      await fx.addRepair({ day: `${YEARS.converted}-05-10`, bleacher, services: [SERVICE_USD] });
      await fx.addRepair({
        day: `${YEARS.converted}-05-12`,
        bleacher,
        currency: "CAD",
        services: [SERVICE_CAD],
      });
      // The year holds only our two repairs, so the total is exactly the USD repair plus the CAD
      // one converted whole at the rate the stand-in answers.
      const expected =
        serviceTotal(SERVICE_USD) + convertCents(serviceTotal(SERVICE_CAD), CAD_RATE);

      await openAnalytics(page);
      await periodButton(page).click();
      await expect(periodOption(page, String(YEARS.converted))).toBeVisible(POLL);
      await periodOption(page, String(YEARS.converted)).click();

      await expect(cardValue(page, "total")).toHaveText(formatUsd(expected), POLL);
      await expect(page.getByTestId("cad-note-text")).toHaveText(
        "1 CAD repair was converted to USD at the Frankfurter (ECB) rate of its Repair from day.",
      );
      await expect(page.getByTestId("rate-missing")).toHaveCount(0);
    });
  });

  test("S10: with no rate and no memory, the CAD repair is left out and the amber line says so", async ({
    page,
  }) => {
    await withFixtures(async (fx) => {
      const bleacher = await fx.addBleacher();
      await fx.addRepair({ day: `${YEARS.noRate}-05-10`, bleacher, services: [SERVICE_USD] });
      await fx.addRepair({
        day: `${YEARS.noRate}-05-12`,
        bleacher,
        currency: "CAD",
        services: [SERVICE_CAD],
      });

      // The call is aborted, and the browser remembers no rate.
      await page.unroute("https://api.frankfurter.dev/**");
      await failRates(page);

      await openAnalytics(page);
      await periodButton(page).click();
      await expect(periodOption(page, String(YEARS.noRate))).toBeVisible(POLL);
      await periodOption(page, String(YEARS.noRate)).click();

      await expect(page.getByTestId("rate-missing-text")).toHaveText(
        "1 CAD repair has no exchange rate yet and is not counted. Open the page again when you are online.",
        POLL,
      );
      await expect(page.getByTestId("cad-note")).toHaveCount(0);
      await expect(cardValue(page, "total")).toHaveText(formatUsd(serviceTotal(SERVICE_USD)));
    });
  });

  test("S12: a budget of the current year shows its percent, and a smaller one shows the red card with Over budget", async ({
    page,
  }) => {
    await withFixtures(async (fx) => {
      const year = currentYear();
      const bleacher = await fx.addBleacher();
      await fx.addRepair({ day: `${year}-07-07`, bleacher, services: [SERVICE_USD] });
      const spend = () => expectedSpendCents(fx.supabase, { year }, CAD_RATE);
      const first = await spend();
      expect(first).toBeGreaterThan(0);

      await openAnalytics(page);

      // A budget four times the spend: a quarter used, not over.
      const roomy = first * 4;
      await fx.setBudget(year, roomy);
      // The card says "Budget not set" until the sync rule of spec 04 delivers the row; without that
      // rule running locally there is nothing to see, and the scenario skips itself.
      try {
        await expect(page.getByTestId("budget-value")).not.toHaveText("—", {
          timeout: 45_000,
        });
      } catch {
        test.skip(true, "MaintenanceBudgets is not synced here (the sync rule of spec 04)");
      }
      await expect
        .poll(
          async () =>
            (await page.getByTestId("budget-value").textContent()) ===
            formatPercent((await spend()) / roomy),
          POLL,
        )
        .toBe(true);
      await expect(page.getByTestId("budget-over-badge")).toHaveCount(0);
      await expect(page.getByTestId("budget-line-2")).toHaveText(
        `Budget ${year}: ${formatUsdWhole(roomy)}`,
      );

      // A budget of half the spend: over it, red, with the words, and a negative remaining.
      await fx.setBudget(year, Math.max(1, Math.floor(first / 2)));
      await expect(page.getByTestId("budget-over-badge")).toBeVisible(POLL);
      await expect(page.getByTestId("budget-over-badge")).toHaveText("Over budget");
      await expect(page.getByTestId("budget-value")).toHaveCSS("color", "rgb(185, 28, 28)");
      await expect(page.getByTestId("budget-line-1")).toContainText("Remaining: -$");
    });
  });
});
