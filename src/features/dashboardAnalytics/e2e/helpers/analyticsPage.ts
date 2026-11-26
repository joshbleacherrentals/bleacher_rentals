import { expect, type Locator, type Page } from "@playwright/test";
import { RATE_MEMORY_KEY } from "../../utils/exchangeRateMemory";

/**
 * What the Dashboard & Analytics specs do on the page: open it, answer or fail the exchange-rate
 * calls, choose a period and read a card. No spec reaches the real Frankfurter API.
 * docs/specs/dashboard-analytics-05-page.md §6.
 */

export const TITLE = "Dashboard & Analytics";

/** The rate the API stand-in answers for every day: 1 CAD is 0.70 USD. */
export const CAD_RATE = 0.7;

const RANGE_URL = /\/v1\/(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})/;

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= end; t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Answers every call to api.frankfurter.dev with `rate` for every day of the range asked for
 * (every day, not only business days, so that no scenario depends on a weekend).
 */
export async function mockRates(page: Page, rate: number = CAD_RATE) {
  await page.route("https://api.frankfurter.dev/**", async (route) => {
    const match = route.request().url().match(RANGE_URL);
    if (!match) {
      await route.fulfill({ status: 404, body: "{}" });
      return;
    }
    const [, from, to] = match;
    const rates = Object.fromEntries(eachDay(from, to).map((day) => [day, { USD: rate }]));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ amount: 1, base: "CAD", start_date: from, end_date: to, rates }),
    });
  });
}

/** Makes every call to api.frankfurter.dev fail, and forgets the rates the browser remembered. */
export async function failRates(page: Page) {
  await page.addInitScript((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // No storage: nothing is remembered anyway.
    }
  }, RATE_MEMORY_KEY);
  await page.route("https://api.frankfurter.dev/**", (route) => route.abort("failed"));
}

/** The page body, which holds the header, the cards and the blocks. */
export const analyticsPage = (page: Page) => page.getByTestId("analytics-page");

/** Opens the page and waits until it has left the loading state. */
export async function openAnalytics(page: Page) {
  await page.goto("/dashboard-analytics");
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("card-total")).toBeVisible({ timeout: 60_000 });
}

export const periodButton = (page: Page) => page.getByRole("button", { name: "Period" });

export const periodOption = (page: Page, label: string) =>
  page.getByRole("menuitemradio", { name: label, exact: true });

/** Chooses a period in the dropdown: a year as text ("2001"), or "All time". */
export async function choosePeriod(page: Page, label: string) {
  await periodButton(page).click();
  await periodOption(page, label).click();
  await expect(periodButton(page)).toContainText(label);
}

export const cardValue = (page: Page, card: "total" | "ready" | "avg" | "open") =>
  page.getByTestId(`card-${card}-value`);
export const cardNote = (page: Page, card: "total" | "ready" | "avg" | "open") =>
  page.getByTestId(`card-${card}-note`);

/** `$1,234.56` or `-$4,946.00` to cents. */
export function centsOf(text: string | null): number {
  const cleaned = (text ?? "").replace(/[$,\s]/g, "");
  return Math.round(Number(cleaned) * 100);
}

/** The text of "{n} of {total} ready to go" as numbers. */
export function readyOf(text: string | null): { ready: number; total: number } | null {
  const match = (text ?? "").match(/^(\d+) of (\d+) ready to go$/);
  return match ? { ready: Number(match[1]), total: Number(match[2]) } : null;
}

/** The four tables of the page, by the names the page gives them. */
export const TABLE_NAMES = [
  "Maintenance cost by operating zone",
  "Top high-cost models",
  "Expense by damage category",
  "Labor and parts cost by service vendor",
];

/** The chart of spend by category. */
export const chartOf = (page: Page): Locator =>
  page.getByRole("img", { name: "Maintenance Spend by Category" });

/**
 * Everything the three roles that open the page see: the title, the five cards, the four tables
 * (the models table is a table only when a model has a repair, so it is looked for by its block) and
 * the chart block, with the period dropdown as the only control.
 */
export async function expectWholePage(page: Page) {
  await expect(page.getByRole("heading", { name: TITLE })).toBeVisible({ timeout: 60_000 });
  for (const id of ["total", "ready", "avg", "open", "budget"]) {
    await expect(page.getByTestId(`card-${id}`)).toBeVisible({ timeout: 60_000 });
  }
  for (const id of ["zones", "models", "categories", "chart", "vendors"]) {
    await expect(page.getByTestId(`${id}-block`)).toBeVisible();
  }
  await expect(page.getByRole("table", { name: TABLE_NAMES[0] })).toBeVisible();
  await expect(page.getByRole("table", { name: TABLE_NAMES[2] })).toBeVisible();

  const body = analyticsPage(page);
  await expect(body.getByRole("button")).toHaveCount(1);
  await expect(periodButton(page)).toBeVisible();
  await expect(body.getByRole("textbox")).toHaveCount(0);
  await expect(body.getByRole("combobox")).toHaveCount(0);
}
