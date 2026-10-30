import { test, expect } from "@playwright/test";

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
});
