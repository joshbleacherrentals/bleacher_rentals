import { test, expect } from "@playwright/test";
import {
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

      await page.goto(`/accountant/invoice?id=${mid.eventId}&tab=tasks&csort=amount&cdir=desc`);
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

  test("S20: the tab bar order is Information, Tasks, Messages, New Task", async ({ page }) => {
    await withBooking("bar", { taskDueInDays: 0 }, async (booking) => {
      await page.goto(`/accountant/invoice?id=${booking.eventId}`);
      await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
        timeout: 60_000,
      });
      const tabs = await page.getByRole("tab").allInnerTexts();
      expect(tabs.map((t) => t.trim())).toEqual(["Information", "Tasks", "Messages"]);
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

  test("S23: New Task opens the Done / Next Task modal; Save completes the task and creates the next", async ({
    page,
  }) => {
    await withBooking("newtask-save", { taskDueInDays: 0 }, async (booking) => {
      await page.goto(`/accountant/invoice?id=${booking.eventId}`);
      await page.getByRole("button", { name: "New Task" }).click();
      const dialog = page.getByRole("dialog", { name: "Done / Next Task" });
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      await dialog.getByRole("button", { name: "Save" }).click();
      await expect(dialog).toHaveCount(0);
      await expect
        .poll(async () => (await tasksOf(booking.eventId)).map((t) => t.completed))
        .toEqual([false, true]);
    });
  });
});
