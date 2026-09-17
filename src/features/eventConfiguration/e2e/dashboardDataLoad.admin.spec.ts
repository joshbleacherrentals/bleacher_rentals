import { test, expect } from "@playwright/test";

/**
 * The dashboard no longer downloads whole tables over PostgREST.
 *
 * Ten Zustand stores used to be filled with `select("*")` on every signed-in
 * page — 16 requests, megabytes of main-thread `JSON.stringify`, and four tables
 * silently truncated at the server's 1000-row cap. This is the test that keeps
 * that from creeping back.
 */
test.describe("Dashboard data loading (admin)", () => {
  test("S1: the grid renders without a single full-table REST read", async ({ page }) => {
    const fullTableReads: string[] = [];

    page.on("request", (request) => {
      const url = request.url();
      // `select=*` with no row filter is the shape the retired loader used.
      if (!url.includes("/rest/v1/")) return;
      if (!/[?&]select=\*/.test(url)) return;
      // Single-row lookups by id are a different thing entirely and still fine.
      if (/[?&]id=eq\./.test(url)) return;
      fullTableReads.push(url);
    });

    await page.goto("/dashboard");
    await expect(
      page.getByTestId("dashboard-canvas").or(page.locator("canvas")).first(),
    ).toBeVisible({
      timeout: 60_000,
    });

    // Give any straggling effect a chance to fire before judging.
    await page.waitForTimeout(3_000);

    expect(fullTableReads, `unexpected full-table reads:\n${fullTableReads.join("\n")}`).toEqual(
      [],
    );
  });
});
