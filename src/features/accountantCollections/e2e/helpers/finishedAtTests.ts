import { test, expect, type Page } from "@playwright/test";
import {
  addTask,
  cleanupBookings,
  createOverdueBooking,
  finishedMoment,
  payInFull,
  tasksOf,
  type SeededBooking,
} from "./collectionsFixtures";

/**
 * The Finished at column of Task History (docs/specs/accountant-collections-18-task-finished-at.md
 * §4, S51 to S54), written once and run as the accountant and as the administrator by
 * `finishedAt.accountant.spec.ts` and `finishedAt.admin.spec.ts`.
 *
 * Finished at is a date, `DD/MM/YYYY`, in the office's time zone (Toronto unless the user chose
 * another one); a dash stands for the open task. The database writes the time, so a task the app
 * or a payment closes shows its date only after the synchronisation: those steps wait up to 60 s.
 *
 * The spec's "closed task without a finish time shows a dash" has no Playwright scenario: the
 * trigger stamps every closed row the API can write, so such a row (a task closed before the
 * migration) exists only through a database session with the trigger off. It is covered by
 * `ar_task_finished_at.test.sql` and the unit tests.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end.
 */

const stamp = Date.now();

/** A day as the Finished at column writes it: DD/MM/YYYY, in the office's time zone. */
const officeDate = (moment: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Toronto",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(moment);

export function defineFinishedAtTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  async function seed(suffix: string, taskNote = "First call") {
    const booking = await createOverdueBooking({
      name: `E2E Finished At ${role} ${suffix} ${stamp}`,
      taskDueInDays: 0,
      taskNote,
    });
    seeded.push(booking);
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  const history = (page: Page) => page.getByRole("region", { name: "Task History" });
  /** The Finished at cell of the n-th body row (from 0). */
  const finishedCell = (page: Page, row: number) =>
    history(page).locator("tbody tr").nth(row).locator("td").nth(1);

  async function open(page: Page, booking: SeededBooking) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  test.describe(`Finished at (${role})`, () => {
    test("S51: Task History has the columns #, Finished at, Due Date, Note, in that order (and, since spec 19, a last hidden Actions column)", async ({
      page,
    }) => {
      const booking = await seed("columns");

      await open(page, booking);
      await expect(history(page).locator("th")).toHaveText([
        "#",
        "Finished at",
        "Due Date",
        "Note",
        "Actions",
      ]);
    });

    test("S52: a closed task with a finish time shows its date, DD/MM/YYYY; the open task shows a dash", async ({
      page,
    }) => {
      const booking = await seed("dates", "Third call");
      await addTask(booking.eventId, {
        dueInDays: -4,
        note: "Second call",
        completed: true,
        finishedDaysAgo: 1,
      });
      await addTask(booking.eventId, {
        dueInDays: -9,
        note: "First call",
        completed: true,
        finishedDaysAgo: 3,
      });

      await open(page, booking);
      // Oldest due date first, the open task last.
      await expect(finishedCell(page, 0)).toHaveText(officeDate(finishedMoment(3)));
      await expect(finishedCell(page, 1)).toHaveText(officeDate(finishedMoment(1)));
      await expect(finishedCell(page, 2)).toHaveText("—");
      for (const row of [0, 1]) {
        await expect(finishedCell(page, row)).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);
      }
    });

    test("S53: New Task closes the open task: after the synchronisation its row shows today's date, and the new Open row a dash", async ({
      page,
    }) => {
      const booking = await seed("new-task");

      await open(page, booking);
      // `exact`: with the window open, "Close New Task window" also contains these words.
      await page.getByRole("button", { name: "New Task", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New Task" });
      await dialog.getByLabel("Note to self:").fill("Second call");
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);

      await expect
        .poll(async () => (await tasksOf(booking.eventId)).map((t) => t.completed))
        .toEqual([false, true]);
      // The closed task first, then the new Open one.
      await expect(history(page).getByText("Second call")).toBeVisible();
      await expect(finishedCell(page, 0)).toHaveText(officeDate(new Date()), { timeout: 60_000 });
      await expect(finishedCell(page, 1)).toHaveText("—");
    });

    test("S54: a payment that closes the open task: its row shows today's date after the synchronisation", async ({
      page,
    }) => {
      const booking = await seed("payment", "Chase payment");

      await open(page, booking);
      await expect(finishedCell(page, 0)).toHaveText("—");

      await payInFull(booking.eventId);
      await expect(history(page).getByText("Open", { exact: true })).toHaveCount(0, {
        timeout: 60_000,
      });
      await expect(finishedCell(page, 0)).toHaveText(officeDate(new Date()), { timeout: 60_000 });
      await expect(history(page).getByText("Chase payment")).toBeVisible();
    });
  });
}
