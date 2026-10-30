import { test, expect } from "@playwright/test";

// docs/specs/qbo-invoice-12a-quote-types-page.md §5, S6: a viewer has no Quote Types entry, and
// /qbo-quote-types sends them away. Written, not run locally (standing instruction: no Playwright
// runs on this machine).

test("S6: no Quote Types entry in the sidebar, and the page redirects", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("link", { name: "Quote Types" })).toHaveCount(0);

  await page.goto("/qbo-quote-types");

  await expect(page).not.toHaveURL(/\/qbo-quote-types/);
  await expect(page.getByRole("heading", { name: "Quote Types" })).toHaveCount(0);
});
