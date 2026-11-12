import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  addTask,
  cleanupBookings,
  createOverdueBooking,
  tasksOf,
  type SeededBooking,
} from "./collectionsFixtures";

/**
 * Deleting a closed task from Task History (docs/specs/accountant-collections-19-task-delete.md §4,
 * S55 to S59), written once and run as the accountant and as the administrator by
 * `taskDelete.accountant.spec.ts` and `taskDelete.admin.spec.ts`.
 *
 * A closed row has a trash button, `Delete task N`; the open row has none. The button opens the
 * window "Are you sure?" with No and Yes. The delete is soft: the row leaves the table at once and
 * stays in the database with `deleted_at` set, which the service-role reads in `tasksOf` show. The
 * row leaves the other sessions after the synchronisation, so those steps wait up to 60 s.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end.
 */

const stamp = Date.now();

export function defineTaskDeleteTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  /**
   * An event with the open task "Third call" and the closed tasks "First call" and "Second call":
   * in Task History they are rows 1 and 2 (oldest due date first) and the open row 3.
   */
  async function seed(suffix: string) {
    const booking = await createOverdueBooking({
      name: `E2E Task Delete ${role} ${suffix} ${stamp}`,
      taskDueInDays: 0,
      taskNote: "Third call",
    });
    seeded.push(booking);
    await addTask(booking.eventId, {
      dueInDays: -9,
      note: "First call",
      completed: true,
      finishedDaysAgo: 8,
    });
    await addTask(booking.eventId, {
      dueInDays: -4,
      note: "Second call",
      completed: true,
      finishedDaysAgo: 3,
    });
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  const history = (page: Page) => page.getByRole("region", { name: "Task History" });
  const bodyRows = (page: Page) => history(page).locator("tbody tr");
  const deleteButton = (page: Page, n: number) =>
    history(page).getByRole("button", { name: `Delete task ${n}`, exact: true });
  const dialog = (page: Page) => page.getByRole("dialog", { name: "Are you sure?" });
  const choice = (page: Page, name: "No" | "Yes") =>
    dialog(page).getByRole("button", { name, exact: true });

  /** The notes of the rows, in order. The number cell and the button are not compared. */
  async function notes(rows: Locator) {
    return (await rows.locator("td:nth-child(4)").allInnerTexts()).map((text) =>
      text.replace(/\s*Open\s*$/, "").trim(),
    );
  }

  async function open(page: Page, booking: SeededBooking) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
    await expect(history(page)).toBeVisible();
  }

  /** The task as the database holds it (service role), by its note. */
  const stored = async (booking: SeededBooking, note: string) =>
    (await tasksOf(booking.eventId)).find((task) => task.note === note);

  test.describe(`Deleting a closed task (${role})`, () => {
    test("S55: every closed row has a delete button, Delete task N; the open row has none", async ({
      page,
    }) => {
      const booking = await seed("buttons");

      await open(page, booking);
      await expect(bodyRows(page)).toHaveCount(3);
      await expect(history(page).getByRole("button", { name: /^Delete task \d+$/ })).toHaveCount(2);
      await expect(deleteButton(page, 1)).toBeVisible();
      await expect(deleteButton(page, 2)).toBeVisible();
      await expect(deleteButton(page, 3)).toHaveCount(0);
      // The open row is the last one and has no button of any kind.
      await expect(bodyRows(page).nth(2)).toContainText("Open");
      await expect(bodyRows(page).nth(2).getByRole("button")).toHaveCount(0);
    });

    test("S56: the button opens Are you sure? with the right number; No, the X, Esc and a click outside each close it and change nothing", async ({
      page,
    }) => {
      const booking = await seed("closing");

      await open(page, booking);
      const before = await notes(bodyRows(page));
      expect(before).toEqual(["First call", "Second call", "Third call"]);

      const closers: { name: string; close: () => Promise<void> }[] = [
        { name: "No", close: () => choice(page, "No").click() },
        {
          name: "the X",
          close: () => dialog(page).getByRole("button", { name: "Close" }).click(),
        },
        { name: "Esc", close: () => page.keyboard.press("Escape") },
        // The top-left corner of the page is on the dimmed backdrop, outside the window.
        { name: "a click outside", close: () => page.mouse.click(4, 4) },
      ];

      for (const closer of closers) {
        await deleteButton(page, 2).click();
        await expect(dialog(page), closer.name).toBeVisible();
        await expect(dialog(page)).toContainText("Task #2 will be deleted from the history.");
        await expect(choice(page, "No")).toBeFocused();
        await expect(choice(page, "Yes")).toBeVisible();

        await closer.close();
        await expect(dialog(page), `${closer.name} closes the window`).toHaveCount(0);
        expect(await notes(bodyRows(page)), `${closer.name} changes nothing`).toEqual(before);
      }

      // Nothing was written, whichever way it was closed.
      expect((await tasksOf(booking.eventId)).map((task) => task.deleted_at)).toEqual([
        null,
        null,
        null,
      ]);
    });

    test("S57: Yes removes the row at once and the rest renumber from 1; the database keeps it with deleted_at set", async ({
      page,
    }) => {
      const booking = await seed("yes");

      await open(page, booking);
      await deleteButton(page, 1).click();
      await expect(dialog(page)).toContainText("Task #1 will be deleted from the history.");
      await choice(page, "Yes").click();

      await expect(dialog(page)).toHaveCount(0);
      await expect(history(page).getByText("First call")).toHaveCount(0);
      expect(await notes(bodyRows(page))).toEqual(["Second call", "Third call"]);
      // Renumbered from 1: "Second call" is row 1 and has the button Delete task 1.
      await expect(bodyRows(page).first().locator("td").first()).toHaveText("1");
      await expect(deleteButton(page, 1)).toBeVisible();
      await expect(deleteButton(page, 2)).toHaveCount(0);

      // A soft delete: the row is still there, hidden, with the moment it was deleted. The upload
      // happens after the click, so it is waited for.
      await expect
        .poll(async () => (await stored(booking, "First call"))?.deleted_at ?? null, {
          timeout: 60_000,
        })
        .not.toBeNull();
      const all = await tasksOf(booking.eventId);
      expect(all).toHaveLength(3);
      expect((await stored(booking, "First call"))?.completed).toBe(true);
      expect((await stored(booking, "Second call"))?.deleted_at).toBeNull();
      expect((await stored(booking, "Third call"))?.deleted_at).toBeNull();
    });

    test("S58: after a reload the row is still gone; a second session of the same user drops it after the synchronisation", async ({
      page,
      browser,
    }) => {
      const booking = await seed("sessions");

      // The second session: the same user, with a local database of its own.
      const second = await browser.newContext({
        storageState: await page.context().storageState(),
      });
      try {
        const other = await second.newPage();
        await open(other, booking);
        await expect(history(other).getByText("First call")).toBeVisible();

        await open(page, booking);
        await deleteButton(page, 1).click();
        await choice(page, "Yes").click();
        await expect(history(page).getByText("First call")).toHaveCount(0);
        await expect
          .poll(async () => (await stored(booking, "First call"))?.deleted_at ?? null, {
            timeout: 60_000,
          })
          .not.toBeNull();

        await page.reload();
        await expect(history(page)).toBeVisible({ timeout: 60_000 });
        await expect(history(page).getByText("Second call")).toBeVisible();
        await expect(history(page).getByText("First call")).toHaveCount(0);

        await expect(history(other).getByText("First call")).toHaveCount(0, { timeout: 60_000 });
        await expect(history(other).getByText("Second call")).toBeVisible();
      } finally {
        await second.close();
      }
    });

    test("S59: deleting every closed task leaves the open row, numbered 1; with no open task the table says No tasks yet.", async ({
      page,
    }) => {
      const withOpen = await seed("all-closed");

      await open(page, withOpen);
      for (const note of ["First call", "Second call"]) {
        // The oldest closed row is always row 1: the rest renumber after each delete.
        await expect(bodyRows(page).first()).toContainText(note);
        await deleteButton(page, 1).click();
        await choice(page, "Yes").click();
        await expect(dialog(page)).toHaveCount(0);
        await expect(history(page).getByText(note)).toHaveCount(0);
      }
      await expect(bodyRows(page)).toHaveCount(1);
      await expect(bodyRows(page).first().locator("td").first()).toHaveText("1");
      await expect(bodyRows(page).first()).toContainText("Third call");
      await expect(history(page).getByText("Open", { exact: true })).toHaveCount(1);
      await expect(history(page).getByRole("button", { name: /^Delete task/ })).toHaveCount(0);

      // An event with no open task and one closed task.
      const noOpen = await createOverdueBooking({
        name: `E2E Task Delete ${role} no-open ${stamp}`,
        taskDueInDays: 0,
        withOpenTask: false,
      });
      seeded.push(noOpen);
      await addTask(noOpen.eventId, {
        dueInDays: -2,
        note: "Only call",
        completed: true,
        finishedDaysAgo: 1,
      });

      await open(page, noOpen);
      await deleteButton(page, 1).click();
      await choice(page, "Yes").click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(history(page).getByText("No tasks yet.")).toBeVisible();
      await expect(history(page).getByRole("button", { name: /^Delete task/ })).toHaveCount(0);
    });
  });
}
