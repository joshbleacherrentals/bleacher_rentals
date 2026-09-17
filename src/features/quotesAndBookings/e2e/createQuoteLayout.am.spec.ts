import { test, expect, type Page } from "@playwright/test";

/**
 * The create-quote form's popups and inputs stay usable on a normal laptop screen: the line item
 * picker scrolls inside the viewport, the contract template list opens upwards when it sits at
 * the bottom of the screen, the notes can be dragged taller within bounds, and the payment
 * schedule has its own clearly labelled button.
 */

test.use({ viewport: { width: 1280, height: 720 } });

async function openNewQuote(page: Page) {
  await page.goto("/quotes-bookings/new");
  await expect(page.getByRole("heading", { name: "Payment Schedule", exact: true })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("Create quote layout", () => {
  test("the Add Line Item dialog fits the screen and scrolls its list", async ({ page }, info) => {
    await openNewQuote(page);
    await page.getByRole("button", { name: /Add Line Item/ }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Add Line Item" })).toBeVisible();
    // Bleacher types arrive through sync; the layout only matters once the list is long.
    const tab = dialog.getByRole("tabpanel");
    await expect(tab.getByRole("button").nth(5)).toBeVisible({ timeout: 60_000 });

    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeInViewport();
    const box = (await dialog.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(720);

    // The list scrolls inside the dialog, and its last entry can be reached that way.
    expect(await tab.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    const last = tab.getByRole("button").last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();

    await page.screenshot({ path: info.outputPath("add-line-item.png") });
  });

  test("the contract template list opens above when there is no room below", async ({
    page,
  }, info) => {
    await openNewQuote(page);

    const trigger = page.getByRole("button", { name: /contract template/i });
    // Park the trigger at the bottom of the screen, where a list opening downwards is cut off.
    await trigger.evaluate((el) => el.scrollIntoView({ block: "end" }));

    // Templates arrive through sync, so a fresh browser can open the list before they are there.
    const list = page.locator("ul.z-\\[9999\\]");
    await expect(async () => {
      if (await list.isVisible()) await trigger.click();
      await trigger.click();
      await expect(list.locator("li").nth(1)).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 60_000 });

    // The very first open is the one that went wrong: its list was measured before it had a
    // width and floated far above the button. The templates are stored locally now, so a reload
    // gets a first open that already has them.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Payment Schedule", exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await trigger.evaluate((el) => el.scrollIntoView({ block: "end" }));
    await trigger.click();
    await expect(list.locator("li").nth(1)).toBeVisible();
    await page.waitForTimeout(300);

    const triggerBox = (await trigger.boundingBox())!;
    const listBox = (await list.boundingBox())!;
    const gap = triggerBox.y - (listBox.y + listBox.height);
    // Above the button, and right against it — not hanging somewhere over the notes.
    expect(gap).toBeGreaterThanOrEqual(-1);
    expect(gap).toBeLessThanOrEqual(8);
    expect(listBox.y).toBeGreaterThanOrEqual(0);

    await page.screenshot({ path: info.outputPath("terms-dropdown.png") });
  });

  test("notes resize vertically between their starting height and six times it", async ({
    page,
  }) => {
    await openNewQuote(page);
    const notes = page.getByPlaceholder("Internal team notes...");

    const style = await notes.evaluate((el) => {
      const s = getComputedStyle(el);
      return { resize: s.resize, height: s.height, minHeight: s.minHeight, maxHeight: s.maxHeight };
    });
    expect(style).toEqual({
      resize: "vertical",
      height: "78px",
      minHeight: "78px",
      maxHeight: "468px",
    });
  });

  test("the payment schedule has its own labelled button", async ({ page }, info) => {
    await openNewQuote(page);

    await page.getByRole("button", { name: /Set up schedule/ }).click();
    await expect(page.getByRole("heading", { name: "Edit Payment Schedule" })).toBeVisible();

    await page.keyboard.press("Escape");
    await page
      .getByRole("heading", { name: "Payment Schedule", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("payment-schedule.png") });
  });
});
