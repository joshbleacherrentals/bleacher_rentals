import { test, expect, type Page } from "@playwright/test";

// Seeded in supabase/seed.sql: a booked quote.
const QUOTE = "85b35a1c-8992-41c5-b051-409f33ee7fc5";
const MESSAGES = `/quotes-bookings/${QUOTE}?tab=messages`;

/**
 * The accountant in the internal chat
 * (docs/specs/accountant-quotes-11-accountant-internal-chat.md §7, S1–S6).
 *
 * Written before the feature, and not run locally. This project only exists once
 * E2E_ACCOUNTANT_EMAIL is configured (see playwright.config.ts); it needs a Clerk accountant user
 * with a seeded Users + Accountants row. The database half — what the accountant may insert,
 * update and delete in the chat tables — is asserted in supabase/tests/accountant_internal_chat.test.sql;
 * this file asserts what the screens show.
 *
 * Every test starts from a known state (joined, or not joined) instead of relying on the order the
 * tests run in. What needs a second signed-in user — an admin mentioning the accountant, an admin
 * adding the accountant to a chat — cannot be written in a single-role project and is marked fixme.
 */

const joinButton = (page: Page) => page.getByRole("button", { name: "Join chat" });
const composer = (page: Page) => page.getByRole("textbox");
const chatMenu = (page: Page) => page.getByRole("button", { name: "Chat menu" });

async function openChat(page: Page) {
  await page.goto(MESSAGES);
  await expect(joinButton(page).or(chatMenu(page))).toBeVisible({ timeout: 60_000 });
}

async function ensureJoined(page: Page) {
  await openChat(page);
  if (await joinButton(page).isVisible()) {
    await joinButton(page).click();
    await expect(chatMenu(page)).toBeVisible();
  }
}

async function ensureLeft(page: Page) {
  await openChat(page);
  if (await chatMenu(page).isVisible()) {
    await chatMenu(page).click();
    await page.getByRole("menuitem", { name: "Leave chat" }).click();
    await expect(joinButton(page)).toBeVisible();
  }
}

async function post(page: Page, text: string) {
  await composer(page).click();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(page.getByText(text)).toBeVisible();
}

test.describe("Internal chat (accountant)", () => {
  test("S1: the sidebar has Messages with Internal only, and the chat bell is in the header", async ({
    page,
  }) => {
    await page.goto("/permissions");

    const sidebar = page.getByTestId("sidebar");
    await expect(sidebar.getByText("Messages", { exact: true })).toBeVisible({ timeout: 60_000 });
    await sidebar.getByText("Messages", { exact: true }).click();
    await expect(sidebar.getByRole("link", { name: "Internal" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "External" })).toHaveCount(0);

    await expect(page.getByRole("button", { name: /^Chat notifications/ })).toBeVisible();
  });

  test("S2: on a quote's Messages tab the accountant can join, and then post", async ({ page }) => {
    await ensureLeft(page);

    // Not a member yet: the Join button, and no composer.
    await expect(joinButton(page)).toBeVisible();
    await expect(page.getByText("Join the chat to send messages.")).toBeVisible();
    await expect(page.getByText("Internal chat is available to admins")).toHaveCount(0);

    await joinButton(page).click();
    await expect(chatMenu(page)).toBeVisible();
    await post(page, `accountant hello ${Date.now()}`);
  });

  test("S2: the accountant edits their own message", async ({ page }) => {
    await ensureJoined(page);
    const original = `accountant original ${Date.now()}`;
    await post(page, original);

    await page.getByText(original).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Edit" }).click();

    const edited = `accountant edited ${Date.now()}`;
    await composer(page).click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type(edited);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(page.getByText(edited)).toBeVisible();
    await expect(page.getByText(original)).toHaveCount(0);
  });

  // S2 (the other half) — the accountant sees the others' messages, and has no Edit on them — needs a
  // message written by another user in the seeded chat, which the seed does not have. The refusal is
  // asserted in the SQL test ("cannot update another user's message").
  test.fixme("S2: the accountant sees other people's messages and cannot edit them", async () => {});

  // S3 — an accountant mentions an admin, an admin mentions the accountant (picker, notification, bell) —
  // needs two signed-in users in one test.
  test.fixme("S3: mentions work both ways, with the notification and the bell", async () => {});

  test("S4: the accountant has no members modal — no Chat members in the menu", async ({
    page,
  }) => {
    await ensureJoined(page);

    await chatMenu(page).click();
    await expect(page.getByRole("menuitem", { name: "Leave chat" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Chat members" })).toHaveCount(0);
  });

  // S4 (the other half) — an admin or an account manager adds the accountant to a chat — needs a second
  // signed-in user. The refusal of an accountant adding someone is asserted in the SQL test.
  test.fixme("S4: an admin or an account manager can add the accountant to a chat", async () => {});

  test("S5: Leave chat removes the conversation from the accountant's list, says so in the chat, and they can join again", async ({
    page,
  }) => {
    await ensureJoined(page);

    await chatMenu(page).click();
    await page.getByRole("menuitem", { name: "Leave chat" }).click();

    await expect(joinButton(page)).toBeVisible();
    await expect(page.getByText(/left the chat\./).first()).toBeVisible();

    // The conversation is no longer in the list on /messages/internal.
    await page.goto("/messages/internal");
    await expect(page.getByText("Select a conversation")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('a[href^="/messages/internal/"]')).toHaveCount(0);

    await openChat(page);
    await joinButton(page).click();
    await expect(chatMenu(page)).toBeVisible();
  });

  test("S6: /messages/internal opens the conversation list and a chat; /messages/external opens the placeholder", async ({
    page,
  }) => {
    await ensureJoined(page);

    await page.goto("/messages/internal");
    await expect(page.getByText("Select a conversation")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Internal chat is available to admins")).toHaveCount(0);

    // The chat the accountant joined is in the list, and opens.
    await page.locator('a[href^="/messages/internal/"]').first().click();
    await expect(page).toHaveURL(/\/messages\/internal\/[0-9a-f-]{36}/);
    await expect(chatMenu(page)).toBeVisible({ timeout: 60_000 });

    // D4: the External page stays reachable by URL, a placeholder with one heading.
    await page.goto("/messages/external");
    await expect(page.getByRole("heading", { name: "External" })).toBeVisible({ timeout: 60_000 });
    await expect(page).toHaveURL(/\/messages\/external/);
  });
});
