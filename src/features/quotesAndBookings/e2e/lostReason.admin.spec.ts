import { test, expect, type Page } from "@playwright/test";

/**
 * Lost with Reason, on the quote form.
 * docs/specs/lost-with-reason.md §4, §8.
 *
 * The spec creates its own quote rather than borrowing a seeded one: it flips
 * the status, which would leak into any other spec sharing the row.
 */

/**
 * Open a Dropdown and choose an option, then confirm the trigger actually took
 * it. Two races make a single click unreliable here: the list closes on any
 * scroll event (Save sits at the page bottom, so Playwright scrolls to reach
 * the row), and the persisted quote store rehydrates after first paint, which
 * can drop a pick made a moment too early. Retrying the whole open-pick-verify
 * step absorbs both.
 */
const pick = async (page: Page, trigger: ReturnType<Page["getByRole"]>, label: string) => {
  const option = page.getByRole("listitem").filter({ hasText: new RegExp(`^${label}$`) });
  await trigger.scrollIntoViewIfNeeded();
  await expect(async () => {
    await trigger.click({ timeout: 5_000 });
    await option.click({ timeout: 5_000 });
    await expect(trigger).toHaveText(label, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
};

const setStatus = (page: Page, label: string) =>
  pick(page, page.getByText("Status", { exact: true }).locator("..").getByRole("button"), label);

const setReason = (page: Page, label: string) =>
  pick(page, page.getByTestId("lost-reason-fields").getByRole("button"), label);

/** The toast, not the Next dev-overlay copy of the same console.error text. */
const toast = (page: Page, text: RegExp) =>
  page.getByRole("region", { name: /Notifications/i }).getByText(text);

const save = (page: Page) => page.getByRole("button", { name: "Save", exact: true }).click();

test.describe("Lost Reason (admin)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/quotes-bookings/new");
    await expect(page.getByRole("heading", { name: "Create Quote" })).toBeVisible();
  });

  test("a quote cannot be saved as Lost without a reason, and the reason sticks", async ({
    page,
  }) => {
    await expect(page.getByTestId("lost-reason-fields")).toBeHidden();

    await setStatus(page, "Lost");
    await expect(page.getByTestId("lost-reason-fields")).toBeVisible();

    await save(page);

    // Refused: still on the form, with the reason asked for by name.
    await expect(toast(page, /Lost Reason is required/i)).toBeVisible();
    await expect(page).toHaveURL(/\/quotes-bookings\/new$/);

    // Pick a reason and the same Save goes through.
    await setReason(page, "Price too high");
    await save(page);
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}$/);

    // And it is still there when the quote is reopened for editing.
    await page.goto(`${page.url()}/edit`);
    await expect(page.getByTestId("lost-reason-fields")).toContainText("Price too high");
  });

  test("'Other' needs a note, and a non-lost status needs nothing", async ({ page }) => {
    await setStatus(page, "Lost");
    await setReason(page, "Other");

    await save(page);
    await expect(toast(page, /needs a note/i)).toBeVisible();
    await expect(page).toHaveURL(/\/quotes-bookings\/new$/);

    // The note unblocks it.
    await page.getByTestId("lost-reason-note").fill("went with a competitor");
    await save(page);
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}$/);
  });

  test("a quote that is not lost saves with no reason at all", async ({ page }) => {
    await setStatus(page, "Lost");
    await setStatus(page, "Quoted");

    await expect(page.getByTestId("lost-reason-fields")).toBeHidden();
    await save(page);
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}$/);
  });

  test("the quote's Contract tab shows the reason under Status", async ({ page }) => {
    await setStatus(page, "Lost");
    await setReason(page, "Other");
    await page.getByTestId("lost-reason-note").fill("went with a competitor");
    await save(page);
    await expect(page).toHaveURL(/\/quotes-bookings\/[0-9a-f-]{36}$/);

    await expect(page.getByText("Lost Reason:")).toBeVisible();
    await expect(page.getByText("Other: went with a competitor")).toBeVisible();
  });
});
