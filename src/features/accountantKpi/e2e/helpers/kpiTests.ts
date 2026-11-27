import { test, expect, type Page } from "@playwright/test";
import {
  addSignature,
  cleanupBookings,
  createOverdueBooking,
  type SeededBooking,
} from "../../../accountantCollections/e2e/helpers/collectionsFixtures";
import { addKpiPayment, createKpiBooking, moveDueDate } from "./kpiFixtures";

/**
 * The KPI tab of /accountant (docs/specs/accountant-kpi.md §3, S1 to S11), written once and run as
 * the accountant and as the administrator by `kpi.accountant.spec.ts` and `kpi.admin.spec.ts`.
 * S12 (who cannot reach the tab) is `kpiAccess.am.spec.ts` and `kpiAccess.viewer.spec.ts`.
 *
 * Every scenario that needs numbers works in a month of its own in 2031, far from any seeded data,
 * and opens the tab on that month with `kfrom` and `kto`, so its cards show its own events only.
 * Money is in dollars of a $1,000.00 event unless said otherwise; a payment names no installment,
 * so it pays the schedule from the oldest row on.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./kpiFixtures.ts and removed at the end.
 */

const stamp = Date.now();
const tabNames = async (page: Page) =>
  (await page.getByRole("tab").allInnerTexts()).map((t) => t.trim().split("\n")[0]);

/** `/accountant?tab=kpi` on one whole month of 2031 (`month` is `01` to `12`). */
const kpiUrl = (month: string, lastDay = "28") =>
  `/accountant?tab=kpi&kfrom=2031-${month}-01&kto=2031-${month}-${lastDay}`;

const value = (page: Page, card: "deposit" | "final") => page.getByTestId(`kpi-card-${card}-value`);
const detail = (page: Page, card: "deposit" | "final") =>
  page.getByTestId(`kpi-card-${card}-detail`);

/** A synced change reaches the page by itself; give it time. */
const SYNC = { timeout: 90_000 };

export function defineKpiTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];
  const name = (suffix: string) => `E2E KPI ${role} ${suffix} ${stamp}`;
  const track = (booking: SeededBooking) => {
    seeded.push(booking);
    return booking;
  };

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  test("S1: the tabs are in order, and ?tab=kpi opens KPI on This month with no receivables controls", async ({
    page,
  }) => {
    await page.goto("/accountant");
    await expect(page.getByRole("tab", { name: "Collections" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60_000 },
    );
    expect(await tabNames(page)).toEqual([
      "Collections",
      "AR Deposits",
      "Need attention",
      "Audit",
      "KPI",
    ]);

    await page.getByRole("tab", { name: "KPI" }).click();

    await expect(page).toHaveURL(/[?&]tab=kpi(&|$)/);
    await expect(page.getByTestId("kpi-tab")).toBeVisible();
    await expect(page).toHaveURL(/[?&]kfrom=\d{4}-\d{2}-01(&|$)/);
    await expect(page).toHaveURL(/[?&]kto=\d{4}-\d{2}-(28|29|30|31)(&|$)/);
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Filters/ })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Deleted" })).toHaveCount(0);
  });

  test("S2: a two-row schedule, the deposit 2 days late and the final 5 days late", async ({
    page,
  }) => {
    track(
      await createKpiBooking({
        name: name("S2"),
        valueCents: 200_000,
        schedule: [
          { dueDate: "2031-01-02", percentageBps: 5000 },
          { dueDate: "2031-01-20", percentageBps: 5000 },
        ],
        payments: [
          { amountCents: 100_000, paidDay: "2031-01-04" },
          { amountCents: 100_000, paidDay: "2031-01-25" },
        ],
      }),
    );

    await page.goto(kpiUrl("01", "31"));

    await expect(value(page, "deposit")).toHaveText("2 days", SYNC);
    await expect(detail(page, "deposit")).toHaveText("1 payment");
    await expect(value(page, "final")).toHaveText("5 days");
    await expect(detail(page, "final")).toHaveText("1 payment");
  });

  test("S3: a part of the deposit is not collected; the rest, on a later day, collects it", async ({
    page,
  }) => {
    const booking = track(
      await createKpiBooking({
        name: name("S3"),
        schedule: [
          { dueDate: "2031-02-01", percentageBps: 5000 },
          { dueDate: "2031-02-20", percentageBps: 5000 },
        ],
        payments: [{ amountCents: 20_000, paidDay: "2031-02-05" }],
      }),
    );

    await page.goto(kpiUrl("02"));

    // $200.00 of a $500.00 deposit: nothing is collected yet.
    await expect(detail(page, "deposit")).toHaveText("0 payments", SYNC);
    await expect(value(page, "deposit")).toHaveText("–");

    await addKpiPayment(booking.eventId, 30_000, "2031-02-09");

    // Collected on Feb 9, 8 days after Feb 1, with no reload.
    await expect(value(page, "deposit")).toHaveText("8 days", SYNC);
    await expect(detail(page, "deposit")).toHaveText("1 payment");
  });

  test("S4: a range that holds no collected day shows a dash; the Audit tab keeps its own range", async ({
    page,
  }) => {
    track(
      await createKpiBooking({
        name: name("S4"),
        schedule: [
          { dueDate: "2031-08-02", percentageBps: 5000 },
          { dueDate: "2031-08-20", percentageBps: 5000 },
        ],
        payments: [{ amountCents: 50_000, paidDay: "2031-08-04" }],
      }),
    );

    await page.goto(kpiUrl("08", "31"));
    await expect(value(page, "deposit")).toHaveText("2 days", SYNC);

    // A month with no payments at all.
    await page.goto(kpiUrl("11", "30"));
    await expect(value(page, "deposit")).toHaveText("–", SYNC);
    await expect(detail(page, "deposit")).toHaveText("0 payments");

    // A preset replaces both dates of the KPI range.
    await page.getByLabel("Period").selectOption({ label: "This month" });
    await expect(page).toHaveURL(/[?&]kfrom=(?!2031)\d{4}-\d{2}-01(&|$)/);

    // The Audit tab opens on its own range and leaves the KPI range alone.
    await page.getByRole("tab", { name: "Audit" }).click();
    await expect(page.getByTestId("audit-tab")).toBeVisible();
    const params = new URL(page.url()).searchParams;
    expect(params.get("from")).not.toMatch(/^2031/);
    expect(params.get("kfrom")).not.toBeNull();
  });

  test("S5: a payment collected before its due date is not counted; one on the due date is", async ({
    page,
  }) => {
    track(
      await createKpiBooking({
        name: name("S5 early"),
        schedule: [{ dueDate: "2031-03-20", percentageBps: 10000 }],
        payments: [{ amountCents: 100_000, paidDay: "2031-03-18" }],
      }),
    );
    track(
      await createKpiBooking({
        name: name("S5 on time"),
        schedule: [{ dueDate: "2031-03-25", percentageBps: 10000 }],
        payments: [{ amountCents: 100_000, paidDay: "2031-03-25" }],
      }),
    );

    await page.goto(kpiUrl("03", "31"));

    await expect(value(page, "final")).toHaveText("0 days", SYNC);
    await expect(detail(page, "final")).toHaveText("1 payment");
  });

  test("S6: a schedule of one row counts in Final Payment and not in Deposit", async ({ page }) => {
    track(
      await createKpiBooking({
        name: name("S6"),
        schedule: [{ dueDate: "2031-04-01", percentageBps: 10000 }],
        payments: [{ amountCents: 100_000, paidDay: "2031-04-03" }],
      }),
    );

    await page.goto(kpiUrl("04", "30"));

    await expect(value(page, "final")).toHaveText("2 days", SYNC);
    await expect(detail(page, "final")).toHaveText("1 payment");
    await expect(value(page, "deposit")).toHaveText("–");
    await expect(detail(page, "deposit")).toHaveText("0 payments");
  });

  test("S7: a booked event with no schedule, paid in full, counts in Final Payment from its signing day", async ({
    page,
  }) => {
    const booking = track(
      await createKpiBooking({
        name: name("S7"),
        payments: [{ amountCents: 100_000, paidDay: "2031-05-12" }],
      }),
    );
    // Signed on May 2 (noon in Toronto), so the payment is due that day and comes 10 days later.
    await addSignature(booking.eventId, {
      status: "active",
      pdf: "none",
      signedAt: "2031-05-02T17:00:00.000Z",
    });

    await page.goto(kpiUrl("05", "31"));

    await expect(value(page, "final")).toHaveText("10 days", SYNC);
    await expect(detail(page, "final")).toHaveText("1 payment");
    await expect(detail(page, "deposit")).toHaveText("0 payments");
  });

  test("S8: moving a due date changes the number at once, without a reload", async ({ page }) => {
    const booking = track(
      await createKpiBooking({
        name: name("S8"),
        schedule: [{ dueDate: "2031-06-01", percentageBps: 10000 }],
        payments: [{ amountCents: 100_000, paidDay: "2031-06-03" }],
      }),
    );

    await page.goto(kpiUrl("06", "30"));
    await expect(value(page, "final")).toHaveText("2 days", SYNC);

    await moveDueDate(booking.eventId, 0, "2031-06-02");

    await expect(value(page, "final")).toHaveText("1 day", SYNC);
  });

  test("S9: days 8, 9 and 11 show 10 days from 3 payments", async ({ page }) => {
    for (const [index, paidDay] of ["2031-07-09", "2031-07-10", "2031-07-12"].entries()) {
      track(
        await createKpiBooking({
          name: name(`S9 ${index}`),
          schedule: [{ dueDate: "2031-07-01", percentageBps: 10000 }],
          payments: [{ amountCents: 100_000, paidDay }],
        }),
      );
    }

    await page.goto(kpiUrl("07", "31"));

    // 28 / 3 = 9.33, shown rounded up.
    await expect(value(page, "final")).toHaveText("10 days", SYNC);
    await expect(detail(page, "final")).toHaveText("3 payments");
  });

  test("S10: Export to CSV is disabled on KPI and enabled again on Collections", async ({
    page,
  }) => {
    track(await createOverdueBooking({ name: name("S10"), taskDueInDays: 0 }));
    const exportButton = page.getByRole("button", { name: "Export to CSV" });

    await page.goto("/accountant?tab=kpi");
    await expect(page.getByTestId("kpi-tab")).toBeVisible({ timeout: 60_000 });
    await expect(exportButton).toBeVisible();
    await expect(exportButton).toBeDisabled();

    await page.getByRole("tab", { name: "Collections" }).click();
    await expect(exportButton).toBeEnabled(SYNC);
  });

  test("S11: From after To shows a message and no numbers; All time counts every collected payment", async ({
    page,
  }) => {
    await page.goto("/accountant?tab=kpi&kfrom=2031-02-01&kto=2031-01-01");
    await expect(page.getByText("The start date is after the end date.")).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId("kpi-card-deposit")).toHaveCount(0);
    await expect(page.getByTestId("kpi-card-final")).toHaveCount(0);

    track(
      await createKpiBooking({
        name: name("S11"),
        schedule: [{ dueDate: "2031-09-01", percentageBps: 10000 }],
        payments: [{ amountCents: 100_000, paidDay: "2031-09-03" }],
      }),
    );

    // One month with one collected payment, then everything.
    await page.goto(kpiUrl("09", "30"));
    await expect(detail(page, "final")).toHaveText("1 payment", SYNC);
    await page.goto("/accountant?tab=kpi&kfrom=&kto=");
    await expect(detail(page, "final")).toHaveText(/^\d+ payments?$/, SYNC);
    const all = Number((await detail(page, "final").innerText()).split(" ")[0]);
    expect(all).toBeGreaterThanOrEqual(1);
    expect(page.url()).toContain("kfrom=&kto=");
  });
}
