import { test, expect, type Page } from "@playwright/test";
import {
  addEventFile,
  addSignature,
  addTask,
  cleanupBookings,
  createOverdueBooking,
  tasksOf,
  type SeededBooking,
} from "./helpers/collectionsFixtures";

/**
 * The Collections tab as an administrator sees it (docs/specs/accountant-collections-09-design.md
 * §5, S1). Written, not run locally (project rule).
 */
test.describe("Collections tab (admin)", () => {
  test("S1: /accountant opens on Collections and the filter controls are absent", async ({
    page,
  }) => {
    await page.goto("/accountant");

    await expect(page.getByRole("tab", { name: "Collections" })).toHaveAttribute(
      "aria-selected",
      "true",
      { timeout: 60_000 },
    );
    await expect(page.getByPlaceholder(/^Search by name, invoice #/)).toHaveCount(0);
    await expect(page.getByRole("switch", { name: "Show Not Due Yet" })).toBeVisible();
  });

  test("an administrator can open an invoice page (a missing one says Invoice not found)", async ({
    page,
  }) => {
    await page.goto("/accountant/invoice?id=00000000-0000-0000-0000-000000000000");
    await expect(page.getByText("Invoice not found")).toBeVisible({ timeout: 60_000 });
  });

  test("Next Task and Previous Task follow the list's amount order (accountant-collections-10 §4)", async ({
    page,
  }) => {
    const stamp = Date.now();
    const seeded: SeededBooking[] = [];
    try {
      for (const [suffix, valueCents] of [
        ["big", 9_000_603],
        ["mid", 9_000_602],
        ["small", 9_000_601],
      ] as const) {
        seeded.push(
          await createOverdueBooking({
            name: `E2E Collections admin nav ${suffix} ${stamp}`,
            taskDueInDays: 0,
            valueCents,
          }),
        );
      }
      const [, mid, small] = seeded;

      await page.goto(`/accountant/invoice?id=${mid.eventId}&tab=info&csort=amount&cdir=desc`);
      await expect(page.getByRole("heading", { name: mid.name })).toBeVisible({ timeout: 60_000 });
      await page.getByRole("link", { name: "Next Task" }).click();
      await expect(page).toHaveURL(new RegExp(`id=${small.eventId}`));

      await expect(page.getByRole("heading", { name: small.name })).toBeVisible();
      await page.getByRole("link", { name: "Previous Task" }).click();
      await expect(page).toHaveURL(new RegExp(`id=${mid.eventId}`));
    } finally {
      await cleanupBookings(seeded.map((b) => b.eventId));
    }
  });
});

// The Messages tab and the New Task button
// (docs/specs/accountant-collections-12-tabs-and-messages.md §4, S20–S23). Written, not run locally.
test.describe("Messages tab and New Task (admin)", () => {
  const stamp = Date.now();

  async function withBooking(
    suffix: string,
    options: Omit<Parameters<typeof createOverdueBooking>[0], "name">,
    run: (booking: SeededBooking) => Promise<void>,
  ) {
    const booking = await createOverdueBooking({
      name: `E2E Collections admin ${suffix} ${stamp}`,
      ...options,
    });
    try {
      await run(booking);
    } finally {
      await cleanupBookings([booking.eventId]);
    }
  }

  test("S20: the tab bar order is Information, Messages, New Task", async ({ page }) => {
    await withBooking("bar", { taskDueInDays: 0 }, async (booking) => {
      await page.goto(`/accountant/invoice?id=${booking.eventId}`);
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
        timeout: 60_000,
      });
      const tabs = await page.getByRole("tab").allInnerTexts();
      expect(tabs.map((t) => t.trim())).toEqual(["Information", "Messages"]);
      await expect(page.getByRole("button", { name: "New Task" })).toBeVisible();
    });
  });

  test("S21: Messages shows Internal and External, and the URL holds the tab", async ({ page }) => {
    await withBooking("messages", { taskDueInDays: 0 }, async (booking) => {
      await page.goto(`/accountant/invoice?id=${booking.eventId}&tab=messages`);
      await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute(
        "aria-selected",
        "true",
        { timeout: 60_000 },
      );
      await expect(page.getByRole("tab", { name: "Internal" })).toBeVisible();
      await page.getByRole("tab", { name: "External" }).click();
      await expect(page.getByText("External messaging coming soon.")).toBeVisible();
    });
  });

  test("S22: New Task is enabled with an open task and disabled without one", async ({ page }) => {
    await withBooking("newtask-on", { taskDueInDays: 0 }, async (booking) => {
      await page.goto(`/accountant/invoice?id=${booking.eventId}`);
      await expect(page.getByRole("button", { name: "New Task" })).toBeEnabled({
        timeout: 60_000,
      });
    });
    await withBooking("newtask-off", { taskDueInDays: 0, withOpenTask: false }, async (booking) => {
      await page.goto(`/accountant/invoice?id=${booking.eventId}`);
      await expect(page.getByRole("button", { name: "New Task" })).toBeDisabled({
        timeout: 60_000,
      });
    });
  });

  test("S23: New Task opens the New Task window; Save completes the task and creates the next", async ({
    page,
  }) => {
    await withBooking("newtask-save", { taskDueInDays: 0 }, async (booking) => {
      await page.goto(`/accountant/invoice?id=${booking.eventId}`);
      await page.getByRole("button", { name: "New Task", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "New Task" });
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => (await tasksOf(booking.eventId)).map((t) => t.completed))
        .toEqual([false, true]);
    });
  });
});

// Task History and Files in Information
// (docs/specs/accountant-collections-13-task-history-and-files.md §4, S24, S25 and S26 in a lighter
// form than the accountant's). Written, not run locally.
test.describe("Task History and Files (admin)", () => {
  const stamp = Date.now();

  async function withBooking(
    suffix: string,
    options: Omit<Parameters<typeof createOverdueBooking>[0], "name">,
    run: (booking: SeededBooking) => Promise<void>,
  ) {
    const booking = await createOverdueBooking({
      name: `E2E Collections admin ${suffix} ${stamp}`,
      ...options,
    });
    try {
      await run(booking);
    } finally {
      await cleanupBookings([booking.eventId]);
    }
  }

  test("S24: Information shows Task History with the open task last, and ?tab=tasks opens Information", async ({
    page,
  }) => {
    await withBooking("history", { taskDueInDays: 0, taskNote: "Second call" }, async (booking) => {
      await addTask(booking.eventId, { dueInDays: -5, note: "First call", completed: true });
      await page.goto(`/accountant/invoice?id=${booking.eventId}&tab=tasks`);
      const history = page.getByRole("region", { name: "Task History" });
      await expect(history).toBeVisible({ timeout: 60_000 });
      await expect(page.getByRole("tab", { name: "Information" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(page.getByRole("tab", { name: "Tasks" })).toHaveCount(0);
      await expect(history.locator("tbody tr").first()).toContainText("First call");
      await expect(history.locator("tbody tr").last()).toContainText("Second call");
      await expect(history.getByText("Open", { exact: true })).toHaveCount(1);
    });
  });

  test("S25 and S26: Files lists the files; Download on each, Delete only on one attached by hand", async ({
    page,
  }) => {
    await withBooking("files", { taskDueInDays: 0 }, async (booking) => {
      await addEventFile(booking.eventId, { name: "Check_Scan.pdf", source: "upload" });
      await addEventFile(booking.eventId, { name: "Quote.pdf", source: "sent_quote" });
      await page.goto(`/accountant/invoice?id=${booking.eventId}`);
      const files = page.getByRole("region", { name: "Files" });
      await expect(files.getByRole("button", { name: /^Download / })).toHaveCount(2, {
        timeout: 60_000,
      });
      await expect(files.getByRole("button", { name: /^Delete / })).toHaveCount(1);
      await expect(files.getByRole("button", { name: "Delete Check_Scan.pdf" })).toBeVisible();
    });
  });
});

// The New Task window (docs/specs/accountant-collections-14-new-task-window.md §4, S30 to S32 in a
// lighter form than the accountant's). Written, not run locally.
test.describe("New Task window (admin)", () => {
  const VIEWPORT = { width: 1280, height: 800 };
  test.use({ viewport: VIEWPORT });

  const stamp = Date.now();

  async function withBooking(
    suffix: string,
    options: Omit<Parameters<typeof createOverdueBooking>[0], "name">,
    run: (booking: SeededBooking) => Promise<void>,
  ) {
    const booking = await createOverdueBooking({
      name: `E2E Collections admin ${suffix} ${stamp}`,
      ...options,
    });
    try {
      await run(booking);
    } finally {
      await cleanupBookings([booking.eventId]);
    }
  }

  const win = (page: Page) => page.getByRole("dialog", { name: "New Task" });

  async function openWindow(page: Page, booking: SeededBooking) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await page.getByRole("button", { name: "New Task", exact: true }).click({ timeout: 60_000 });
    await expect(win(page)).toBeVisible();
  }

  async function box(locator: ReturnType<typeof win>) {
    const b = await locator.boundingBox();
    if (!b) throw new Error("not on screen");
    return b;
  }

  test("S30: New Task opens the window at the design's place and size, not modal", async ({
    page,
  }) => {
    await withBooking("win-open", { taskDueInDays: 0 }, async (booking) => {
      await openWindow(page, booking);
      await expect(win(page)).toHaveAttribute("aria-modal", "false");
      const b = await box(win(page));
      expect([b.x, b.y, b.width, b.height].map(Math.round)).toEqual([730, 250, 430, 360]);
    });
  });

  test("S31: while it is open, the Messages tab can be clicked and the window stays", async ({
    page,
  }) => {
    await withBooking("win-page", { taskDueInDays: 0 }, async (booking) => {
      await openWindow(page, booking);
      const before = await box(win(page));
      await page.getByRole("tab", { name: "Messages" }).click();
      await expect(page.getByRole("tab", { name: "Messages" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(win(page)).toBeVisible();
      expect(await box(win(page))).toEqual(before);
    });
  });

  test("S32: dragging the title bar moves the window and cannot take it off the screen", async ({
    page,
  }) => {
    await withBooking("win-move", { taskDueInDays: 0 }, async (booking) => {
      await openWindow(page, booking);
      const title = win(page).getByRole("heading", { name: "New Task" });
      const drag = async (dx: number, dy: number) => {
        const b = await box(title);
        const x = b.x + b.width / 2;
        const y = b.y + b.height / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 12 });
        await page.mouse.up();
      };

      const start = await box(win(page));
      await drag(-200, 100);
      const moved = await box(win(page));
      expect(Math.round(moved.x)).toBe(Math.round(start.x - 200));
      expect(Math.round(moved.y)).toBe(Math.round(start.y + 100));

      await drag(-3000, -3000);
      const corner = await box(win(page));
      expect([Math.round(corner.x), Math.round(corner.y)]).toEqual([0, 0]);
    });
  });
});

// Open PDF in the header (docs/specs/accountant-collections-15-open-pdf.md §4, S38 to S40 in a
// lighter form than the accountant's). Written, not run locally.
test.describe("Open PDF (admin)", () => {
  const stamp = Date.now();

  async function withBooking(
    suffix: string,
    run: (booking: SeededBooking) => Promise<void>,
  ): Promise<void> {
    const booking = await createOverdueBooking({
      name: `E2E Collections admin ${suffix} ${stamp}`,
      taskDueInDays: 0,
    });
    try {
      await run(booking);
    } finally {
      await cleanupBookings([booking.eventId]);
    }
  }

  const open = async (page: Page, booking: SeededBooking) => {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
  };

  test("S38: with no signature, Open PDF links to the quote PDF in a new tab", async ({ page }) => {
    await withBooking("pdf-none", async (booking) => {
      await open(page, booking);
      const link = page.getByRole("link", { name: "Open PDF" });
      await expect(link).toHaveAttribute("href", `/api/quotes/${booking.eventId}/pdf`);
      await expect(link).toHaveAttribute("target", "_blank");
    });
  });

  test("S39: with an active signature and a stored PDF, Open PDF is a button that opens the signed file", async ({
    page,
    context,
  }) => {
    await withBooking("pdf-signed", async (booking) => {
      const signature = await addSignature(booking.eventId, { status: "active", pdf: "stored" });
      // Stubbed, so no PDF viewer opens: what is checked is the address of the new tab.
      await context.route(/\/storage\/v1\/object\/sign\/contracts\//, (route) =>
        route.request().method() === "GET"
          ? route.fulfill({ status: 200, contentType: "application/pdf", body: "%PDF-1.4 e2e" })
          : route.continue(),
      );

      await open(page, booking);
      await expect(page.getByRole("link", { name: "Open PDF" })).toHaveCount(0);
      const popup = context.waitForEvent("page");
      await page.getByRole("button", { name: "Open PDF" }).click();
      await expect
        .poll(async () => (await popup).url())
        .toContain(`/storage/v1/object/sign/contracts/${booking.eventId}/${signature.id}.pdf`);
    });
  });

  test("S40: an invalidated signature opens the quote PDF; a signed path with no object shows a toast", async ({
    page,
    context,
  }) => {
    await withBooking("pdf-invalidated", async (booking) => {
      await addSignature(booking.eventId, { status: "invalidated", pdf: "stored" });
      await open(page, booking);
      await expect(page.getByRole("link", { name: "Open PDF" })).toHaveAttribute(
        "href",
        `/api/quotes/${booking.eventId}/pdf`,
      );
    });

    await withBooking("pdf-missing", async (booking) => {
      await addSignature(booking.eventId, { status: "active", pdf: "missing" });
      await open(page, booking);
      await page.getByRole("button", { name: "Open PDF" }).click();
      await expect(page.getByText("Could not open the signed PDF")).toBeVisible();
      await expect.poll(() => context.pages().length).toBe(1);
    });
  });
});
