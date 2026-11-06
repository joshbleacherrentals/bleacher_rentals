import { test, expect, type BrowserContext, type Page, type Route } from "@playwright/test";
import {
  addEventFile,
  addSignature,
  addTask,
  cleanupBookings,
  createOverdueBooking,
  eventFilesOf,
  payInFull,
  tasksOf,
  type SeededBooking,
} from "./helpers/collectionsFixtures";

/**
 * The Collections tab and the invoice page as an accountant sees them
 * (docs/specs/accountant-collections-09-design.md §5, S1–S10 and S12; and
 * accountant-collections-10-prev-next.md §4, S13–S19; and
 * accountant-collections-12-tabs-and-messages.md §4, S20–S23; and
 * accountant-collections-13-task-history-and-files.md §4, S24–S29, which also rewrote S6, S7, S9
 * and S12 and the paths of S13–S19 now that the Tasks tab is gone; and
 * accountant-collections-14-new-task-window.md §4, S30–S37, which also rewrote the modal steps of
 * S6, S17 and S23 for the New Task window; and
 * accountant-collections-15-open-pdf.md §4, S38–S40).
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
      "AR Deposits",
      "Need attention",
    ]);
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Deleted" })).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Not Due Yet" })).toBeVisible();

    await page.getByRole("tab", { name: /^AR Deposits/ }).click();
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

  test("S6: New Task completes the old task and shows the new one in Task History; a task dated today stays in Collections, a later one leaves it", async ({
    page,
  }) => {
    const booking = await seed("tasks", { taskDueInDays: 0, taskNote: "First call" });

    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    const history = page.getByRole("region", { name: "Task History" });
    await expect(history.getByText("First call")).toBeVisible({ timeout: 60_000 });

    // `exact`: with the window open, "Close New Task window" also contains these words.
    await page.getByRole("button", { name: "New Task", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New Task" });
    await expect(dialog.getByRole("button", { name: /2 Days/ })).toBeVisible();
    const note = dialog.getByLabel("Note to self:");
    await expect(note).toHaveValue("Follow-up needed");

    await note.fill("   ");
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

    await note.fill("Second call");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/accountant\/invoice/);
    await expect(history.getByText("Second call")).toBeVisible();

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

    await expect(
      page.getByRole("region", { name: "Task History" }).getByText("Open", { exact: true }),
    ).toHaveCount(0, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "New Task" })).toBeDisabled();
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

  test("S9: an event with no open task opens; Task History says No tasks yet. and New Task is disabled", async ({
    page,
  }) => {
    const booking = await seed("notask", { taskDueInDays: 0, withOpenTask: false });

    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    const history = page.getByRole("region", { name: "Task History" });
    await expect(history.getByText("No tasks yet.")).toBeVisible({ timeout: 60_000 });
    await expect(history.getByText("Open", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "New Task" })).toBeDisabled();
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

    for (const tab of ["info", "messages"]) {
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
      `/accountant/invoice?id=${eventId}&tab=info${query}`;
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
      expect(params(page).get("tab")).toBe("info");
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

      await page.getByRole("button", { name: "New Task", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New Task" });
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

// The Messages tab and the New Task button (docs/specs/accountant-collections-12-tabs-and-messages.md §4).
test.describe("Messages tab and New Task (accountant)", () => {
  const invoiceUrl = (eventId: string, query = "") => `/accountant/invoice?id=${eventId}${query}`;
  const newTask = (page: Page) => page.getByRole("button", { name: "New Task", exact: true });

  async function open(page: Page, booking: SeededBooking, query = "") {
    await page.goto(invoiceUrl(booking.eventId, query));
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  test("S20: the tab bar order is Information, Messages, New Task", async ({ page }) => {
    const booking = await seed("bar", { taskDueInDays: 0 });

    await open(page, booking);
    const tabs = await page.getByRole("tab").allInnerTexts();
    expect(tabs.map((t) => t.trim())).toEqual(["Information", "Messages"]);
    await expect(newTask(page)).toBeVisible();
    // New Task is a button after the tabs, not one of them.
    await expect(page.getByRole("tab", { name: "New Task" })).toHaveCount(0);
    const [messages, button] = await Promise.all([
      page.getByRole("tab", { name: "Messages" }).boundingBox(),
      newTask(page).boundingBox(),
    ]);
    expect(button!.x).toBeGreaterThan(messages!.x);
  });

  test("S21: Messages shows Internal and External; a message sent in Internal appears and the URL holds the tab; Next Task keeps it", async ({
    page,
  }) => {
    const booking = await seed("messages", { taskDueInDays: 0, valueCents: 9_001_001 });
    await seed("messages-next", { taskDueInDays: 0, valueCents: 9_001_000 });

    await open(page, booking, "&csort=amount&cdir=desc");
    await page.getByRole("tab", { name: "Messages" }).click();
    await expect.poll(() => params(page).get("tab")).toBe("messages");
    await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await expect(page.getByRole("tab", { name: "Internal" })).toBeVisible();
    await page.getByRole("tab", { name: "External" }).click();
    await expect(page.getByText("External messaging coming soon.")).toBeVisible();

    await page.getByRole("tab", { name: "Internal" }).click();
    const join = page.getByRole("button", { name: "Join chat" });
    const menu = page.getByRole("button", { name: "Chat menu" });
    await expect(join.or(menu)).toBeVisible({ timeout: 60_000 });
    if (await join.isVisible()) {
      await join.click();
      await expect(menu).toBeVisible();
    }
    const text = `collections hello ${Date.now()}`;
    await page.getByRole("textbox").click();
    await page.keyboard.type(text);
    await page.keyboard.press("Enter");
    await expect(page.getByText(text)).toBeVisible();

    await page.getByRole("link", { name: "Next Task" }).click();
    await expect(page).toHaveURL(/tab=messages/);
  });

  test("S22: New Task is enabled with an open task and disabled without one", async ({ page }) => {
    const withTask = await seed("newtask-on", { taskDueInDays: 0 });
    const withoutTask = await seed("newtask-off", { taskDueInDays: 0, withOpenTask: false });

    await open(page, withTask);
    await expect(newTask(page)).toBeEnabled();

    await open(page, withoutTask);
    await expect(newTask(page)).toBeDisabled();
    await expect(newTask(page)).toHaveAttribute("title", "There is no open task");
  });

  test("S23: New Task opens the New Task window; Save completes the task and creates the next", async ({
    page,
  }) => {
    const booking = await seed("newtask-save", { taskDueInDays: 0, taskNote: "First call" });

    await open(page, booking, "&tab=messages");
    await newTask(page).click();
    const dialog = page.getByRole("dialog", { name: "New Task" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Note to self:").fill("Second call");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toHaveCount(0);

    await expect
      .poll(async () => (await tasksOf(booking.eventId)).map((t) => t.completed))
      .toEqual([false, true]);
    await page.getByRole("tab", { name: "Information" }).click();
    await expect(
      page.getByRole("region", { name: "Task History" }).getByText("Second call"),
    ).toBeVisible();
  });
});

// Task History and Files in Information
// (docs/specs/accountant-collections-13-task-history-and-files.md §4, S24–S29).
test.describe("Task History and Files (accountant)", () => {
  const history = (page: Page) => page.getByRole("region", { name: "Task History" });
  const files = (page: Page) => page.getByRole("region", { name: "Files" });

  async function open(page: Page, booking: SeededBooking, query = "") {
    await page.goto(`/accountant/invoice?id=${booking.eventId}${query}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  /** The text of each row of a table body, cells joined by " | ". */
  const rowTexts = async (region: ReturnType<typeof history>) =>
    (await region.locator("tbody tr").allInnerTexts()).map((row) =>
      row
        .split("\t")
        .map((cell) => cell.trim())
        .join(" | "),
    );

  test("S24: Information opens with Task History: completed oldest first, the open one last with Open; no tasks says No tasks yet.; no Tasks tab and ?tab=tasks opens Information", async ({
    page,
  }) => {
    const booking = await seed("history", { taskDueInDays: 0, taskNote: "Third call" });
    await addTask(booking.eventId, { dueInDays: -9, note: "First call", completed: true });
    await addTask(booking.eventId, { dueInDays: -4, note: "Second call", completed: true });
    const empty = await seed("history-empty", { taskDueInDays: 0, withOpenTask: false });

    await open(page, booking);
    await expect(history(page).locator("th")).toHaveText(["#", "Date", "Note"]);
    const rows = await rowTexts(history(page));
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatch(/^1 \| \d+ days ago \| First call$/);
    expect(rows[1]).toMatch(/^2 \| \d+ days ago \| Second call$/);
    expect(rows[2]).toMatch(/^3 \| Due Today \| Third call\s*Open$/);
    await expect(history(page).getByText("Open", { exact: true })).toHaveCount(1);
    // Task History is the first section of Information.
    const sections = page
      .getByRole("tabpanel", { name: "Information" })
      .locator(":scope > section");
    await expect(sections.first()).toHaveAccessibleName("Task History");

    await expect(page.getByRole("tab", { name: "Tasks" })).toHaveCount(0);
    await page.goto(`/accountant/invoice?id=${booking.eventId}&tab=tasks`);
    await expect(page.getByRole("tab", { name: "Information" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60_000 },
    );
    await expect(history(page)).toBeVisible();

    await open(page, empty);
    await expect(history(page).getByText("No tasks yet.")).toBeVisible();
  });

  test("S25: Files lists the event's files; each has Download; a Download starts a file", async ({
    page,
  }) => {
    const booking = await seed("files", { taskDueInDays: 0 });
    await addEventFile(booking.eventId, { name: "Check_Scan.pdf", source: "upload" });
    await addEventFile(booking.eventId, { name: "Quote.pdf", source: "sent_quote" });

    await open(page, booking);
    await expect(files(page).locator("th")).toHaveText([
      "#",
      "File Name",
      "Type",
      "Date",
      "Action",
    ]);
    await expect(files(page).getByRole("button", { name: "Attach File" })).toBeVisible();
    const rows = await rowTexts(files(page));
    expect(rows[0]).toMatch(/^1 \| Check_Scan\.pdf \| PDF \| /);
    expect(rows[1]).toMatch(/^2 \| Quote\.pdf \| PDF \| /);
    await expect(files(page).getByRole("button", { name: /^Download / })).toHaveCount(2);

    const download = page.waitForEvent("download");
    await files(page).getByRole("button", { name: "Download Check_Scan.pdf" }).click();
    expect((await download).suggestedFilename()).toBe("Check_Scan.pdf");
  });

  test("S26: Delete appears only on a file attached by hand; the confirmation deletes it; a signed-contract row has none", async ({
    page,
  }) => {
    const booking = await seed("files-delete", { taskDueInDays: 0 });
    await addEventFile(booking.eventId, { name: "Signed_Contract.pdf", source: "signed_contract" });
    await addEventFile(booking.eventId, { name: "Check_Scan.pdf", source: "upload" });

    await open(page, booking);
    await expect(files(page).getByRole("button", { name: /^Delete / })).toHaveCount(1);
    await expect(
      files(page).getByRole("button", { name: "Delete Signed_Contract.pdf" }),
    ).toHaveCount(0);

    await files(page).getByRole("button", { name: "Delete Check_Scan.pdf" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete file?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(files(page).getByText("Check_Scan.pdf")).toBeVisible();

    await files(page).getByRole("button", { name: "Delete Check_Scan.pdf" }).click();
    await dialog.getByRole("button", { name: "Delete" }).click();
    await expect(files(page).getByText("Check_Scan.pdf")).toHaveCount(0, { timeout: 30_000 });
    await expect
      .poll(async () => (await eventFilesOf(booking.eventId)).map((f) => f.file_name))
      .toEqual(["Signed_Contract.pdf"]);
  });

  test("S27: Attach File: choose two files, Ready to Upload (2) shows, drop one, Save; the row appears; there is no drop zone", async ({
    page,
  }) => {
    const booking = await seed("files-attach", { taskDueInDays: 0 });
    const pdf = (name: string) => ({
      name,
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 e2e"),
    });

    await open(page, booking);
    await expect(files(page).getByText("No files uploaded yet")).toBeVisible();
    await expect(files(page).getByText(/drag|drop/i)).toHaveCount(0);

    await files(page)
      .locator('input[type="file"]')
      .setInputFiles([pdf("one.pdf"), pdf("two.pdf")]);
    await expect(files(page).getByText("Ready to Upload (2)")).toBeVisible();
    await files(page).getByRole("button", { name: "Remove two.pdf" }).click({ force: true });
    await expect(files(page).getByText("Ready to Upload (1)")).toBeVisible();

    await files(page).getByRole("button", { name: "Save" }).click();
    await expect(files(page).getByText("Ready to Upload")).toHaveCount(0, { timeout: 30_000 });
    await expect(files(page).getByRole("button", { name: "Download one.pdf" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(files(page).getByRole("button", { name: "Delete one.pdf" })).toBeVisible();
    await expect
      .poll(async () => await eventFilesOf(booking.eventId))
      .toEqual([{ file_name: "one.pdf", source: "upload" }]);
  });

  test("S28: a file of a wrong type or over 20 MB is refused with a toast and is not listed", async ({
    page,
  }) => {
    const booking = await seed("files-refuse", { taskDueInDays: 0 });

    await open(page, booking);
    const input = files(page).locator('input[type="file"]');
    await input.setInputFiles({
      name: "archive.zip",
      mimeType: "application/zip",
      buffer: Buffer.from("PK"),
    });
    await expect(page.getByText("Invalid file type")).toBeVisible();
    await expect(files(page).getByText("Ready to Upload")).toHaveCount(0);

    await input.setInputFiles({
      name: "huge.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.alloc(21 * 1024 * 1024),
    });
    await expect(page.getByText("File too large")).toBeVisible();
    await expect(files(page).getByText("Ready to Upload")).toHaveCount(0);
    expect(await eventFilesOf(booking.eventId)).toEqual([]);
  });

  test("S29: when a payment closes the open task, its row loses the Open tag after the sync", async ({
    page,
  }) => {
    const booking = await seed("history-closes", { taskDueInDays: 0, taskNote: "Chase payment" });

    await open(page, booking);
    await expect(history(page).getByText("Open", { exact: true })).toHaveCount(1);

    await payInFull(booking.eventId);
    await expect(history(page).getByText("Open", { exact: true })).toHaveCount(0, {
      timeout: 60_000,
    });
    await expect(history(page).getByText("Chase payment")).toBeVisible();
  });
});

// The New Task window (docs/specs/accountant-collections-14-new-task-window.md §4, S30–S37).
test.describe("New Task window (accountant)", () => {
  const VIEWPORT = { width: 1280, height: 800 };
  test.use({ viewport: VIEWPORT });

  const newTask = (page: Page) => page.getByRole("button", { name: "New Task", exact: true });
  const win = (page: Page) => page.getByRole("dialog", { name: "New Task" });
  const handle = (page: Page, label: string) =>
    win(page).getByRole("button", { name: label, exact: true });

  async function open(page: Page, booking: SeededBooking, query = "") {
    await page.goto(`/accountant/invoice?id=${booking.eventId}${query}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  async function openWindow(page: Page) {
    await newTask(page).click();
    await expect(win(page)).toBeVisible();
  }

  async function box(locator: ReturnType<typeof win>) {
    const b = await locator.boundingBox();
    if (!b) throw new Error("not on screen");
    return b;
  }

  /** Press at the centre of `from`, move by (dx, dy) in steps, release. */
  async function dragBy(page: Page, from: ReturnType<typeof win>, dx: number, dy: number) {
    const b = await box(from);
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 12 });
    await page.mouse.up();
  }

  const title = (page: Page) => win(page).getByRole("heading", { name: "New Task" });

  test("S30: New Task opens the window at the design's place and size; the page behind is not dimmed", async ({
    page,
  }) => {
    const booking = await seed("win-open", { taskDueInDays: 0 });

    await open(page, booking);
    await openWindow(page);

    await expect(win(page)).toHaveAttribute("aria-modal", "false");
    const b = await box(win(page));
    expect(b.x).toBeCloseTo(730, 0);
    expect(b.y).toBeCloseTo(250, 0);
    expect(b.width).toBeCloseTo(430, 0);
    expect(b.height).toBeCloseTo(360, 0);
    // No overlay: nothing the size of the screen sits over the page.
    await expect(page.locator('[class*="bg-black/50"]')).toHaveCount(0);
    await expect(win(page).getByLabel("Note to self:")).toHaveValue("Follow-up needed");
  });

  test("S31: while it is open, the Messages tab can be clicked and the page scrolls; the window keeps its screen position", async ({
    page,
  }) => {
    const booking = await seed("win-page", { taskDueInDays: 0 });

    await open(page, booking);
    await openWindow(page);
    const before = await box(win(page));

    // Scroll a long Information page with the pointer outside the window.
    const moneyBefore = await box(page.getByRole("region", { name: "Money" }));
    await page.mouse.move(500, 700);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(async () => (await box(page.getByRole("region", { name: "Money" }))).y)
      .toBeLessThan(moneyBefore.y);
    expect(await box(win(page))).toEqual(before);

    await page.getByRole("tab", { name: "Messages" }).click();
    await expect.poll(() => params(page).get("tab")).toBe("messages");
    await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(win(page)).toBeVisible();
    expect(await box(win(page))).toEqual(before);
  });

  test("S32: dragging the title bar moves the window and cannot take it off the screen", async ({
    page,
  }) => {
    const booking = await seed("win-move", { taskDueInDays: 0 });

    await open(page, booking);
    await openWindow(page);
    const start = await box(win(page));

    await dragBy(page, title(page), -200, 100);
    const moved = await box(win(page));
    expect(moved.x).toBeCloseTo(start.x - 200, 0);
    expect(moved.y).toBeCloseTo(start.y + 100, 0);
    expect(moved.width).toBeCloseTo(start.width, 0);
    expect(moved.height).toBeCloseTo(start.height, 0);

    // Far up and to the left: it stops at the corner.
    await dragBy(page, title(page), -3000, -3000);
    const corner = await box(win(page));
    expect(corner.x).toBeCloseTo(0, 0);
    expect(corner.y).toBeCloseTo(0, 0);

    // Far down and to the right: the whole width stays in, the top 48 px stay on screen.
    await dragBy(page, title(page), 5000, 5000);
    const far = await box(win(page));
    expect(far.x + far.width).toBeCloseTo(VIEWPORT.width, 0);
    expect(far.y).toBeCloseTo(VIEWPORT.height - 48, 0);
  });

  test("S33: the east edge changes only the width, the south edge only the height, the corner both; the minimum holds", async ({
    page,
  }) => {
    const booking = await seed("win-size", { taskDueInDays: 0 });

    await open(page, booking);
    await openWindow(page);
    const start = await box(win(page));

    await dragBy(page, handle(page, "Resize window width"), 100, 60);
    const wide = await box(win(page));
    expect(wide.width).toBeCloseTo(start.width + 100, 0);
    expect(wide.height).toBeCloseTo(start.height, 0);

    await dragBy(page, handle(page, "Resize window height"), 60, 40);
    const tall = await box(win(page));
    expect(tall.height).toBeCloseTo(wide.height + 40, 0);
    expect(tall.width).toBeCloseTo(wide.width, 0);

    await dragBy(page, handle(page, "Resize window"), 30, 20);
    const both = await box(win(page));
    expect(both.width).toBeCloseTo(tall.width + 30, 0);
    expect(both.height).toBeCloseTo(tall.height + 20, 0);
    expect(both.x).toBeCloseTo(start.x, 0);
    expect(both.y).toBeCloseTo(start.y, 0);

    await dragBy(page, handle(page, "Resize window"), -3000, -3000);
    const small = await box(win(page));
    expect(small.width).toBeCloseTo(320, 0);
    expect(small.height).toBeCloseTo(240, 0);
  });

  test("S34: after a move and a resize, closing and reopening, and a reload, keep the geometry", async ({
    page,
  }) => {
    const booking = await seed("win-keep", { taskDueInDays: 0 });

    await open(page, booking);
    await openWindow(page);
    await dragBy(page, title(page), -150, -100);
    await dragBy(page, handle(page, "Resize window"), 60, 40);
    const kept = await box(win(page));

    await page.getByRole("button", { name: "Close New Task window" }).click();
    await expect(win(page)).toHaveCount(0);
    await openWindow(page);
    expect(await box(win(page))).toEqual(kept);

    await page.reload();
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
    await openWindow(page);
    expect(await box(win(page))).toEqual(kept);
  });

  test("S35: Save completes the open task and creates the next; the window closes; Task History shows the new Open row", async ({
    page,
  }) => {
    const booking = await seed("win-save", { taskDueInDays: 0, taskNote: "First call" });

    await open(page, booking);
    await openWindow(page);
    await win(page).getByLabel("Note to self:").fill("Second call");
    await win(page).getByRole("button", { name: "Save" }).click();
    await expect(win(page)).toHaveCount(0);

    await expect
      .poll(async () => (await tasksOf(booking.eventId)).map((t) => t.completed))
      .toEqual([false, true]);
    const history = page.getByRole("region", { name: "Task History" });
    await expect(history.getByText("Second call")).toBeVisible();
    await expect(history.getByText("Open", { exact: true })).toHaveCount(1);
  });

  test("S36: Previous Task / Next Task closes the window; the next event's window opens clean; going back does not reopen it", async ({
    page,
  }) => {
    const first = await seed("win-nav-first", { taskDueInDays: 0, valueCents: 9_002_002 });
    const second = await seed("win-nav-second", { taskDueInDays: 0, valueCents: 9_002_001 });

    await open(page, first, "&csort=amount&cdir=desc");
    await openWindow(page);
    await win(page).getByLabel("Note to self:").fill("Typed on the first event");

    await page.getByRole("link", { name: "Next Task" }).click();
    await expect(page).toHaveURL(new RegExp(`id=${second.eventId}`));
    await expect(page.getByRole("heading", { name: second.name })).toBeVisible();
    await expect(win(page)).toHaveCount(0);

    await openWindow(page);
    await expect(win(page).getByLabel("Note to self:")).toHaveValue("Follow-up needed");

    await page.getByRole("link", { name: "Previous Task" }).click();
    await expect(page).toHaveURL(new RegExp(`id=${first.eventId}`));
    await expect(page.getByRole("heading", { name: first.name })).toBeVisible();
    await expect(win(page)).toHaveCount(0);
  });

  test("S37: the calendar opens inside the window; a day can be picked while the window is moved", async ({
    page,
  }) => {
    const booking = await seed("win-calendar", { taskDueInDays: 0 });

    await open(page, booking);
    await openWindow(page);

    // Found by its aria-expanded, not its label: the label changes with the chosen day.
    const dateButton = win(page).locator("button[aria-expanded]");
    await expect(dateButton).toContainText("2 Days");
    await expect(dateButton).toHaveAttribute("aria-expanded", "false");
    await dateButton.click();
    await expect(dateButton).toHaveAttribute("aria-expanded", "true");

    const calendar = win(page).getByRole("group", { name: "Choose the date for the next task" });
    await expect(calendar).toBeVisible();
    // Inside the window, not floating above the page.
    const [inner, outer] = await Promise.all([box(calendar), box(win(page))]);
    expect(inner.x).toBeGreaterThanOrEqual(outer.x);
    expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width);

    await dragBy(page, title(page), -120, 40);
    await expect(calendar).toBeVisible();

    await calendar.locator('button[aria-pressed="false"]:not([disabled])').first().click();
    await expect(calendar).toHaveCount(0);
    await expect(dateButton).toHaveAttribute("aria-expanded", "false");
    await expect(dateButton).not.toContainText("2 Days");
  });
});

// Open PDF in the header (docs/specs/accountant-collections-15-open-pdf.md §4, S38–S40). The PDF
// responses are fulfilled by the test, so no PDF viewer opens and no PDF is rendered: what is
// checked is which address the new tab was sent to.
test.describe("Open PDF (accountant)", () => {
  const openPdf = (page: Page) => page.getByRole("link", { name: "Open PDF" });
  const openPdfButton = (page: Page) => page.getByRole("button", { name: "Open PDF" });

  async function open(page: Page, booking: SeededBooking) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  }

  /** Answers a quote PDF and a signed PDF with a stub, and records the addresses asked for. */
  async function stubPdfs(context: BrowserContext) {
    const asked: string[] = [];
    const stub = (route: Route) => {
      if (route.request().method() !== "GET") return route.continue();
      asked.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: "%PDF-1.4 e2e",
      });
    };
    await context.route(/\/api\/quotes\/[^/]+\/pdf(\?.*)?$/, stub);
    await context.route(/\/storage\/v1\/object\/sign\/contracts\//, stub);
    return asked;
  }

  test("S38: with no signature, Open PDF is a link that opens the quote PDF in a new tab", async ({
    page,
    context,
  }) => {
    const booking = await seed("pdf-none", { taskDueInDays: 0 });
    const asked = await stubPdfs(context);

    await open(page, booking);
    await expect(openPdf(page)).toHaveAttribute("href", `/api/quotes/${booking.eventId}/pdf`);
    await expect(openPdf(page)).toHaveAttribute("target", "_blank");

    const popup = context.waitForEvent("page");
    await openPdf(page).click();
    await expect((await popup).url()).toContain(`/api/quotes/${booking.eventId}/pdf`);

    // The invoice page is where it was.
    await expect(page).toHaveURL(new RegExp(`/accountant/invoice\\?id=${booking.eventId}`));
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible();
    expect(asked.some((url) => url.includes("/storage/v1/"))).toBe(false);
  });

  test("S39: with an active signature and a stored PDF, Open PDF opens the signed file (a signed URL on the contracts bucket)", async ({
    page,
    context,
  }) => {
    const booking = await seed("pdf-signed", { taskDueInDays: 0 });
    const signature = await addSignature(booking.eventId, { status: "active", pdf: "stored" });
    const asked = await stubPdfs(context);

    await open(page, booking);
    // A button, not a link: the address is signed at the click.
    await expect(openPdfButton(page)).toBeVisible();
    await expect(openPdf(page)).toHaveCount(0);

    const popup = context.waitForEvent("page");
    await openPdfButton(page).click();
    const opened = await popup;
    await expect
      .poll(() => opened.url())
      .toContain(`/storage/v1/object/sign/contracts/${booking.eventId}/${signature.id}.pdf`);
    expect(opened.url()).toContain("token=");

    await expect(page).toHaveURL(new RegExp(`/accountant/invoice\\?id=${booking.eventId}`));
    expect(asked.some((url) => url.includes("/api/quotes/"))).toBe(false);
  });

  test("S40: an invalidated signature, or one without a stored PDF, opens the quote PDF", async ({
    page,
    context,
  }) => {
    const invalidated = await seed("pdf-invalidated", { taskDueInDays: 0 });
    await addSignature(invalidated.eventId, { status: "invalidated", pdf: "stored" });
    const empty = await seed("pdf-empty-path", { taskDueInDays: 0 });
    await addSignature(empty.eventId, { status: "active", pdf: "none" });
    await stubPdfs(context);

    for (const booking of [invalidated, empty]) {
      await open(page, booking);
      await expect(openPdf(page)).toHaveAttribute("href", `/api/quotes/${booking.eventId}/pdf`);
      const popup = context.waitForEvent("page");
      await openPdf(page).click();
      await expect((await popup).url()).toContain(`/api/quotes/${booking.eventId}/pdf`);
    }
  });

  test("S40: a signed path that points at a missing object shows a toast, closes the blank tab and opens nothing else", async ({
    page,
    context,
  }) => {
    const booking = await seed("pdf-missing", { taskDueInDays: 0 });
    await addSignature(booking.eventId, { status: "active", pdf: "missing" });
    const asked = await stubPdfs(context);

    await open(page, booking);
    await openPdfButton(page).click();

    await expect(page.getByText("Could not open the signed PDF")).toBeVisible();
    // The blank tab goes away again; only the invoice page is left, still on the same event.
    await expect.poll(() => context.pages().length).toBe(1);
    await expect(page).toHaveURL(new RegExp(`/accountant/invoice\\?id=${booking.eventId}`));
    // Never the quote PDF in its place.
    expect(asked.some((url) => url.includes("/api/quotes/"))).toBe(false);
  });
});
