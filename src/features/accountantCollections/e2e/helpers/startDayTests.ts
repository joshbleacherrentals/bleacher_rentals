import { test, expect, type Page } from "@playwright/test";
import {
  addInstallments,
  cleanupBookings,
  createOverdueBooking,
  tasksOf,
  type SeededBooking,
} from "./collectionsFixtures";

/**
 * An event with no payment schedule is overdue from its start day
 * (docs/specs/accountant-collections-24-no-schedule-due-on-start-day.md §4, S79 to S83), written
 * once and run as the accountant and as the administrator by `startDay.accountant.spec.ts` and
 * `startDay.admin.spec.ts`.
 *
 * Every event here is made with `withOpenTask: false`: the task of an overdue event is the one the
 * database makes by itself (the sync of spec 11), and that is part of what is under test, so it
 * reaches the list after the synchronisation and these steps wait up to 60 s for it. An event that
 * is not overdue gets no task at all.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end.
 */

const stamp = Date.now();
/** Each event is worth $1,000.00 (the fixture's default), all of it unpaid. */
const WHOLE_AMOUNT = "$1,000.00";

export function defineStartDayTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  async function seed(
    suffix: string,
    startInDays: number,
    options: { schedule?: { dueInDays: number; percentageBps: number }[] } = {},
  ) {
    const booking = await createOverdueBooking({
      name: `E2E Start Day ${role} ${suffix} ${stamp}`,
      taskDueInDays: 0,
      withOpenTask: false,
      startInDays,
    });
    seeded.push(booking);
    if (options.schedule) await addInstallments(booking.eventId, options.schedule);
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  /** The row of the Collections list that holds the event's link. */
  const rowOf = (page: Page, booking: SeededBooking) =>
    page.getByRole("row").filter({ has: page.getByRole("link", { name: booking.name }) });
  /** The Payment Overdue cell (the third) and the Amount Overdue cell (the fifth) of a row. */
  const paymentOverdue = (page: Page, booking: SeededBooking) =>
    rowOf(page, booking).locator("td").nth(2);
  const amountOverdue = (page: Page, booking: SeededBooking) =>
    rowOf(page, booking).locator("td").nth(4);

  async function openList(page: Page, expected: SeededBooking) {
    await page.goto("/accountant?tab=collections");
    // The proof that the list has loaded: an event that is overdue is there.
    await expect(page.getByRole("link", { name: expected.name })).toBeVisible({ timeout: 60_000 });
  }

  async function openInvoice(page: Page, booking: SeededBooking) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  const statusBadge = (page: Page) => page.getByTitle("Status is calculated from payments");

  test.describe(`No payment schedule is overdue from the start day (${role})`, () => {
    test("S79: an event with no schedule that starts in 5 days is not in the Collections list: no row, no task", async ({
      page,
    }) => {
      const early = await seed("early", 5);
      const control = await seed("early-control", 0);

      await openList(page, control);
      await expect(page.getByRole("link", { name: early.name })).toHaveCount(0);
      expect(await tasksOf(early.eventId)).toEqual([]);
    });

    test("S80: the user's two events: A (a schedule of one payment due today, the event starts in 5 days) is in the list with its whole unpaid amount; B (no schedule, same start) is not", async ({
      page,
    }) => {
      const a = await seed("event-a", 5, { schedule: [{ dueInDays: 0, percentageBps: 10_000 }] });
      const b = await seed("event-b", 5);

      await openList(page, a);
      await expect(amountOverdue(page, a)).toHaveText(WHOLE_AMOUNT);
      await expect(page.getByRole("link", { name: b.name })).toHaveCount(0);
      expect(await tasksOf(b.eventId)).toEqual([]);
    });

    test("S81: an event with no schedule that starts today is in the list with the whole unpaid amount, and its Payment Overdue says Due today", async ({
      page,
    }) => {
      const today = await seed("today", 0);

      await openList(page, today);
      await expect(amountOverdue(page, today)).toHaveText(WHOLE_AMOUNT);
      await expect(paymentOverdue(page, today)).toHaveText("Due today");
    });

    test("S82: an event with no schedule that started 3 days ago is in the list and its Payment Overdue shows 3 days (counted from the start day)", async ({
      page,
    }) => {
      const started = await seed("started", -3);

      await openList(page, started);
      await expect(amountOverdue(page, started)).toHaveText(WHOLE_AMOUNT);
      await expect(paymentOverdue(page, started)).toHaveText("3 days");
    });

    test("S83: the invoice page of an event that starts in 5 days shows Schedule and no days overdue; the page of one that starts today shows Collections", async ({
      page,
    }) => {
      const early = await seed("page-early", 5);
      const today = await seed("page-today", 0);

      await openInvoice(page, early);
      await expect(statusBadge(page)).toHaveText("Schedule");
      await expect(page.getByText(/days? overdue/)).toHaveCount(0);

      await openInvoice(page, today);
      await expect(statusBadge(page)).toHaveText("Collections");
    });
  });
}
