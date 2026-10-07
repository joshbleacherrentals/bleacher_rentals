import { test, expect } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";

/**
 * The internal chat for an account manager is exactly what it was before the accountant joined it
 * (docs/specs/accountant-quotes-11-accountant-internal-chat.md §7, S7).
 *
 * Written, not run locally. An admin's side is asserted in quoteCapabilities.admin.spec.ts (the chat
 * on the Messages tab) and a viewer's in quoteCapabilities.viewer.spec.ts (the message that stands
 * in for it).
 */

test.describe("Internal chat (account manager)", () => {
  test("S7: the sidebar still offers Messages with both Internal and External", async ({
    page,
  }) => {
    await page.goto("/quotes-bookings");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByText("Messages", { exact: true })).toBeVisible({ timeout: 60_000 });
    await sidebar.getByText("Messages", { exact: true }).click();
    await expect(sidebar.getByRole("link", { name: "Internal" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "External" })).toBeVisible();
  });

  test("S7: the chat bell is in the header, and the Messages tab shows the chat", async ({
    page,
  }) => {
    await page.goto(`/quotes-bookings/${QUOTE}?tab=messages`);

    await expect(page.getByRole("button", { name: /^Chat notifications/ })).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      page
        .getByRole("button", { name: "Join chat" })
        .or(page.getByRole("button", { name: "Chat menu" })),
    ).toBeVisible();
    await expect(page.getByText("Internal chat is available to admins")).toHaveCount(0);
  });
});
