import { expect, type Page } from "@playwright/test";
import { openEventForm } from "./eventFormPage";
import { readEventHue, type SeededEventAlert } from "./eventAlertFixtures";

/**
 * What the dashboard's event panel looks like now that it is a view
 * (docs/specs/dashboard-events-read-only.md §5). Written once, run under each role by the
 * `dashboardEventReadOnly.*.spec.ts` files.
 *
 * The +/– next to a bleacher is not driven here: the grid is a PixiJS canvas with no click hook.
 * Its rule is covered by the unit tests of `canEditEvent` and `saveEventPanelChange`.
 */

/** The panel must not offer to save, create or delete anything. */
export async function expectNoSaveControls(page: Page): Promise<void> {
  for (const name of ["Create Event", "Update Event", "Delete Event"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  await expect(page.getByText("You have read-only access to this event.")).toHaveCount(0);
}

/** Every field of the Core tab is on screen and cannot be changed. */
export async function expectCoreFieldsReadOnly(page: Page): Promise<void> {
  await expect(page.getByPlaceholder("Enter event name")).toBeDisabled();
  await expect(page.getByPlaceholder("Enter goodshuffle url")).toBeDisabled();
  for (const input of await page.locator('input[type="date"]').all()) {
    await expect(input).toBeDisabled();
  }
}

/** The Quote button goes to the read-only card, not to `/edit`. */
export async function expectQuoteOpensCard(page: Page, eventUuid: string): Promise<void> {
  const quote = page.getByRole("link", { name: "Quote" });
  await expect(quote).toBeVisible();
  await expect(quote).toHaveAttribute("href", `/quotes-bookings/${eventUuid}`);
  await quote.click();
  await expect(page).toHaveURL(new RegExp(`/quotes-bookings/${eventUuid}$`));
}

export async function openPanel(page: Page, fixture: SeededEventAlert): Promise<void> {
  await openEventForm(page, fixture.eventUuid);
}

export const palette = (page: Page) => page.getByTitle("Open hue slider");

/** Opens the palette, moves the slider to its end, and waits for Postgres to hold the colour. */
export async function dragColourAndExpectSaved(
  page: Page,
  fixture: SeededEventAlert,
): Promise<void> {
  await palette(page).click();
  const slider = page.getByLabel("Event Hue");
  await slider.focus();
  // A key press is one gesture: key down starts it, key up lets go and saves.
  await page.keyboard.press("End");
  await expect(slider).toHaveValue("359");

  // The write goes through PowerSync, so Postgres follows a moment later.
  await expect.poll(() => readEventHue(fixture.eventUuid), { timeout: 60_000 }).toBe(359);
}
