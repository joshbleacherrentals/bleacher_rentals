import { test, expect } from "@playwright/test";
import {
  cleanupBookings,
  createOverdueBooking,
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
