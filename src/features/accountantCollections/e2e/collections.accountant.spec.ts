import { test, expect, type Page } from "@playwright/test";
import {
  cleanupBookings,
  createOverdueBooking,
  payInFull,
  tasksOf,
  type SeededBooking,
} from "./helpers/collectionsFixtures";

/**
 * The Collections tab and the invoice page as an accountant sees them
 * (docs/specs/accountant-collections-09-design.md §5, S1–S10 and S12; and
 * accountant-collections-10-prev-next.md §4, S13–S19).
 *
 * Written, not run locally (project rule). This project only exists once E2E_ACCOUNTANT_EMAIL is
 * configured (see playwright.config.ts). The data is written with the service role by
 * ./helpers/collectionsFixtures.ts and removed at the end.
 */

const params = (page: Page) => new URL(page.url()).searchParams;
const stamp = Date.now();
const seeded: SeededBooking[] = [];

async function seed(
  suffix: string,
  options: Omit<Parameters<typeof createOverdueBooking>[0], "name">,
) {
  const booking = await createOverdueBooking({
    name: `E2E Collections ${suffix} ${stamp}`,
    ...options,
  });
  seeded.push(booking);
  return booking;
}

test.afterAll(async () => {
  await cleanupBookings(seeded.map((b) => b.eventId));
});

test.describe("Collections tab (accountant)", () => {
  test("S1: /accountant opens on Collections, the tabs are in order, and the filter controls are absent", async ({
    page,
  }) => {
    await page.goto("/accountant");

    await expect(page.getByRole("tab", { name: "Collections" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60_000 },
    );
    const tabs = await page.getByRole("tab").allInnerTexts();
    expect(tabs.map((t) => t.trim().split("\n")[0])).toEqual([
      "Collections",
      "AR",
      "AR Deposits",
      "Need attention",
    ]);
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Deleted" })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Not Due Yet" })).toBeVisible();

    await page.getByRole("tab", { name: /^AR(?! Deposits)/ }).click();
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toBeVisible();
  });

  test("S2: the list shows today's and older tasks; Show Not Due Yet adds a future one", async ({
    page,
  }) => {
    const due = await seed("due", { taskDueInDays: 0 });
    const future = await seed("future", { taskDueInDays: 5 });

    await page.goto("/accountant?tab=collections");
    await expect(page.getByRole("link", { name: due.name })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: future.name })).toHaveCount(0);

    await page.getByRole("switch", { name: "Show Not Due Yet" }).click();
    await expect.poll(() => params(page).get("cnotdue")).toBe("1");
    await expect(page.getByRole("link", { name: future.name })).toBeVisible();
  });

  test("S3: the default order is oldest task first; Amount Overdue sorts descending, then ascending; a reload keeps it", async ({
    page,
  }) => {
    const older = await seed("older", { taskDueInDays: -5, valueCents: 10_000 });
    const newer = await seed("newer", { taskDueInDays: -1, valueCents: 90_000 });

    await page.goto("/accountant?tab=collections");
    const names = () => page.getByRole("row").allInnerTexts();
    await expect(page.getByRole("link", { name: older.name })).toBeVisible({ timeout: 60_000 });
    const index = async (name: string) => (await names()).findIndex((row) => row.includes(name));
    expect(await index(older.name)).toBeLessThan(await index(newer.name));

    await page.getByRole("button", { name: /Amount Overdue/ }).click();
    await expect.poll(() => params(page).get("csort")).toBe("amount");
    expect(params(page).get("cdir")).toBe("desc");
    expect(await index(newer.name)).toBeLessThan(await index(older.name));

    await page.getByRole("button", { name: /Amount Overdue/ }).click();
    await expect.poll(() => params(page).get("cdir")).toBe("asc");

    await page.reload();
    await expect(page.getByRole("columnheader", { name: /Amount Overdue/ })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
  });

  test("S4: a row opens the invoice page on Information; Back to tasks returns with the same sort", async ({
    page,
  }) => {
    const booking = await seed("row", { taskDueInDays: -2 });

    await page.goto("/accountant?tab=collections&csort=amount&cdir=desc");
    await page.getByRole("link", { name: booking.name }).click();
    await expect(page).toHaveURL(/\/accountant\/invoice\?/);
    expect(params(page).get("id")).toBe(booking.eventId);
    expect(params(page).get("tab")).toBe("info");
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible();

    await page.getByRole("link", { name: /Back to tasks/ }).click();
    await expect(page).toHaveURL(/\/accountant\?/);
    expect(params(page).get("tab")).toBe("collections");
    expect(params(page).get("csort")).toBe("amount");
    expect(params(page).get("cdir")).toBe("desc");
  });

  test("S5: Information shows the sections of the design and the status; a Collections event shows N days overdue", async ({
    page,
  }) => {
    const booking = await seed("info", { taskDueInDays: 0 });

    await page.goto(`/accountant/invoice?id=${booking.eventId}&tab=info`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
    for (const section of ["Venue", "Event", "Money", "Payment Schedule", "Payment History"]) {
      await expect(page.getByRole("region", { name: section })).toBeVisible();
    }
    await expect(page.getByText("Collections", { exact: true })).toBeVisible();
    await expect(page.getByText(/\d+ days? overdue/)).toBeVisible();
  });

  test("S5: a cancelled and a not-yet-active event show their grey statuses", async ({ page }) => {
    const lost = await seed("lost", { taskDueInDays: 0, status: "lost", withOpenTask: false });
    const quoted = await seed("quoted", {
      taskDueInDays: 0,
      status: "quoted",
      withOpenTask: false,
    });

    await page.goto(`/accountant/invoice?id=${lost.eventId}`);
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/days? overdue/)).toHaveCount(0);

    await page.goto(`/accountant/invoice?id=${quoted.eventId}`);
    await expect(page.getByText("Not active yet", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
  });

  test("S6: Done / Next Task completes the old task and shows the new one; a task dated today stays in Collections, a later one leaves it", async ({
    page,
  }) => {
    const booking = await seed("tasks", { taskDueInDays: 0, taskNote: "First call" });

    await page.goto(`/accountant/invoice?id=${booking.eventId}&tab=tasks`);
    await expect(page.getByText("First call")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Done / Next Task" }).click();
    const dialog = page.getByRole("dialog", { name: "Done / Next Task" });
    await expect(dialog.getByRole("button", { name: /2 Days/ })).toBeVisible();
    const note = dialog.getByLabel("Note to self:");
    await expect(note).toHaveValue("Follow-up needed");

    await note.fill("   ");
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

    await note.fill("Second call");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/accountant\/invoice/);
    await expect(page.getByText("Second call")).toBeVisible();

    await expect
      .poll(async () => (await tasksOf(booking.eventId)).map((t) => t.completed))
      .toEqual([false, true]);

    // The new task is dated today + 2, so it has left the default list.
    await page.goto("/accountant?tab=collections");
    await expect(page.getByRole("link", { name: booking.name })).toHaveCount(0, {
      timeout: 30_000,
    });
  });

  test("S7: recording the whole overdue amount completes the tasks once the server has run its trigger", async ({
    page,
  }) => {
    const booking = await seed("paid", { taskDueInDays: 0 });

    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
    await payInFull(booking.eventId);

    await expect(page.getByRole("row", { name: /E2E Payer/ })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible({ timeout: 60_000 });

    await page.getByRole("tab", { name: "Tasks" }).click();
    await expect(page.getByText("No open task")).toBeVisible({ timeout: 60_000 });
  });

  test("S8: Payment History has Show deleted off beside Record payment; a row opens the payment dialog", async ({
    page,
  }) => {
    const booking = await seed("history", { taskDueInDays: 0 });
    await payInFull(booking.eventId, 25_000);

    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    const history = page.getByRole("region", { name: "Payment History" });
    await expect(history).toBeVisible({ timeout: 60_000 });
    await expect(history.getByRole("switch", { name: "Show deleted" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(
      history.getByRole("button", { name: "Record payment", exact: true }),
    ).toBeVisible();

    await history
      .getByRole("row", { name: /Payment details for/ })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeVisible();
    await expect(history.getByText("Stripe payments cannot be edited or deleted.")).toBeVisible();
  });

  test("S9: an event with no open task opens; Tasks says No open task", async ({ page }) => {
    const booking = await seed("notask", { taskDueInDays: 0, withOpenTask: false });

    await page.goto(`/accountant/invoice?id=${booking.eventId}&tab=tasks`);
    await expect(page.getByText("No open task")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Done / Next Task" })).toHaveCount(0);
  });

  test("S10: an event with no contacts still opens the invoice page", async ({ page }) => {
    const booking = await seed("nocontact", { taskDueInDays: 0 });

    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("region", { name: /^Contact/ })).toHaveCount(0);
  });

  test("S12: there is no Send Email button on either tab", async ({ page }) => {
    const booking = await seed("noemail", { taskDueInDays: 0 });

    for (const tab of ["info", "tasks"]) {
      await page.goto(`/accountant/invoice?id=${booking.eventId}&tab=${tab}`);
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole("button", { name: /Send Email/i })).toHaveCount(0);
    }
  });

  // Previous Task / Next Task (docs/specs/accountant-collections-10-prev-next.md §4). The amounts
  // are consecutive cents, so no other event can sit between two seeded ones in an amount order.
  test.describe("Previous Task and Next Task", () => {
    const invoiceUrl = (eventId: string, query = "") =>
      `/accountant/invoice?id=${eventId}&tab=tasks${query}`;
    const previous = (page: Page) => page.getByRole("link", { name: "Previous Task" });
    const next = (page: Page) => page.getByRole("link", { name: "Next Task" });

    async function open(page: Page, booking: SeededBooking, query: string) {
      await page.goto(invoiceUrl(booking.eventId, query));
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
        timeout: 60_000,
      });
    }

    test("S13: sorted by amount, largest first, Next Task is the next smaller amount and Previous returns", async ({
      page,
    }) => {
      const big = await seed("nav-big", { taskDueInDays: 0, valueCents: 9_000_003 });
      const mid = await seed("nav-mid", { taskDueInDays: 0, valueCents: 9_000_002 });
      const small = await seed("nav-small", { taskDueInDays: 0, valueCents: 9_000_001 });
      const query = "&csort=amount&cdir=desc";

      await open(page, mid, query);
      await next(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${small.eventId}`));
      expect(params(page).get("tab")).toBe("tasks");
      expect(params(page).get("csort")).toBe("amount");
      expect(params(page).get("cdir")).toBe("desc");

      await expect(page.getByRole("heading", { name: small.name })).toBeVisible();
      await previous(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${mid.eventId}`));

      await open(page, big, query);
      await expect(previous(page)).toHaveAttribute("aria-disabled", "true");
    });

    test("S14: the same smallest first: Next Task is the next larger amount", async ({ page }) => {
      const big = await seed("nav-asc-big", { taskDueInDays: 0, valueCents: 9_000_103 });
      const mid = await seed("nav-asc-mid", { taskDueInDays: 0, valueCents: 9_000_102 });
      const small = await seed("nav-asc-small", { taskDueInDays: 0, valueCents: 9_000_101 });

      await open(page, mid, "&csort=amount&cdir=asc");
      await next(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${big.eventId}`));

      await open(page, small, "&csort=amount&cdir=asc");
      await expect(previous(page)).toHaveAttribute("aria-disabled", "true");
    });

    test("S15: sorted by task date, oldest first, Next Task is a little newer", async ({
      page,
    }) => {
      const oldest = await seed("nav-date-1", { taskDueInDays: -3652 });
      const middle = await seed("nav-date-2", { taskDueInDays: -3651 });
      const newest = await seed("nav-date-3", { taskDueInDays: -3650 });

      await open(page, middle, "");
      await next(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${newest.eventId}`));

      await open(page, middle, "&csort=follow&cdir=desc");
      await next(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${oldest.eventId}`));
    });

    test("S16: Show Not Due Yet changes the neighbours", async ({ page }) => {
      const big = await seed("nav-due-big", { taskDueInDays: 0, valueCents: 9_000_203 });
      const notDue = await seed("nav-due-mid", { taskDueInDays: 5, valueCents: 9_000_202 });
      const small = await seed("nav-due-small", { taskDueInDays: 0, valueCents: 9_000_201 });

      await open(page, big, "&csort=amount&cdir=desc");
      await next(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${small.eventId}`));

      await open(page, big, "&csort=amount&cdir=desc&cnotdue=1");
      await next(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${notDue.eventId}`));
      expect(params(page).get("cnotdue")).toBe("1");
    });

    test("S17: after Save the event may leave the list, and Next Task still opens the pre-save neighbour", async ({
      page,
    }) => {
      await seed("nav-save-big", { taskDueInDays: 0, valueCents: 9_000_303 });
      const mid = await seed("nav-save-mid", { taskDueInDays: 0, valueCents: 9_000_302 });
      const small = await seed("nav-save-small", { taskDueInDays: 0, valueCents: 9_000_301 });

      await open(page, mid, "&csort=amount&cdir=desc");
      await expect(next(page)).toHaveAttribute("href", /id=/);

      await page.getByRole("button", { name: "Done / Next Task" }).click();
      const dialog = page.getByRole("dialog", { name: "Done / Next Task" });
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);

      // The new task is dated in the future and Show Not Due Yet is off: mid has left the list.
      await next(page).click();
      await expect(page).toHaveURL(new RegExp(`id=${small.eventId}`));
    });

    test("S18: a direct link to an event outside the list has both buttons disabled", async ({
      page,
    }) => {
      const hidden = await seed("nav-hidden", { taskDueInDays: 5, valueCents: 9_000_401 });

      await open(page, hidden, "&csort=amount&cdir=desc");
      await expect(previous(page)).toHaveAttribute("aria-disabled", "true");
      await expect(next(page)).toHaveAttribute("aria-disabled", "true");
    });

    test("S19: Back to tasks keeps the sort", async ({ page }) => {
      const booking = await seed("nav-back", { taskDueInDays: 0, valueCents: 9_000_501 });

      await open(page, booking, "&csort=amount&cdir=desc");
      await page.getByRole("link", { name: "Back to tasks" }).click();
      await expect(page).toHaveURL(/\/accountant\?/);
      expect(params(page).get("tab")).toBe("collections");
      expect(params(page).get("csort")).toBe("amount");
      expect(params(page).get("cdir")).toBe("desc");
    });
  });

  test("an unknown id says Invoice not found, with a link to Collections", async ({ page }) => {
    await page.goto("/accountant/invoice?id=00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Invoice not found")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: "Back to Collections" })).toBeVisible();
  });
});
