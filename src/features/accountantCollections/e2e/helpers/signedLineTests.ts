import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  addBookedLog,
  addSignature,
  aStaffMember,
  cleanupBookings,
  createOverdueBooking,
  type SeededBooking,
} from "./collectionsFixtures";

/**
 * The Signed / Booked line under Invoice in the Information tab
 * (docs/specs/accountant-collections-20-signed-booked-line.md §4, S60 to S64), written once and run
 * as the accountant and as the administrator by `signedLine.accountant.spec.ts` and
 * `signedLine.admin.spec.ts`.
 *
 * The time is written in the office's zone (Toronto unless the user chose another one), with the
 * zone's short name. The fixtures use moments whose Toronto time is fixed: 19:14 UTC on Oct 22 is
 * 3:14 PM EDT, and 14:15 UTC on Nov 3 is 9:15 AM EST (the clocks went back on Nov 1).
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end. The rows reach the page by synchronisation, so
 * the checks wait up to 60 s.
 */

const stamp = Date.now();

const SIGNED_AT = "2026-10-22T19:14:00.000Z";
const SIGNED_TEXT = "Oct 22, 2026 at 3:14 PM EDT";
const BOOKED_AT = "2026-11-03T14:15:00.000Z";
const BOOKED_TEXT = "Nov 3, 2026 at 9:15 AM EST";
/** The shape of a moment written by the page, whatever the day: `Nov 12, 2026 at 3:14 PM EST`. */
const ANY_MOMENT = "[A-Z][a-z]{2} \\d{1,2}, \\d{4} at \\d{1,2}:\\d{2} (AM|PM) [A-Z]{2,5}";

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function defineSignedLineTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  async function seed(suffix: string, status: "booked" | "quoted" = "booked") {
    const booking = await createOverdueBooking({
      name: `E2E Signed line ${role} ${suffix} ${stamp}`,
      taskDueInDays: 0,
      status,
    });
    seeded.push(booking);
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  const information = (page: Page) => page.getByRole("tabpanel", { name: "Information" });
  /** The grey strip: Account Manager's label sits in its right group. */
  const strip = (page: Page): Locator =>
    information(page).getByText("Account Manager", { exact: true }).locator("xpath=../..");
  /** The second line of the left group: the line whose label is exactly `Signed` or `Booked`. */
  const secondLine = (page: Page, label: "Signed" | "Booked"): Locator =>
    strip(page)
      .locator("span", { hasText: new RegExp(`^${label}$`) })
      .locator("xpath=..");
  const anySecondLine = (page: Page): Locator =>
    strip(page).locator("span", { hasText: /^(Signed|Booked)$/ });

  /** The line's text: the label, the moment and, when there is one, ` by {name}`. */
  const lineText = (label: string, moment: string | RegExp, by?: string): RegExp => {
    const body = typeof moment === "string" ? escapeRegExp(moment) : moment.source;
    return new RegExp(`^${label}\\s*${body}${by ? `\\s+by ${escapeRegExp(by)}` : ""}$`);
  };

  async function open(page: Page, booking: SeededBooking) {
    await page.goto(`/accountant/invoice?id=${booking.eventId}`);
    await expect(page.getByRole("heading", { name: booking.name })).toBeVisible({
      timeout: 60_000,
    });
    await expect(strip(page)).toContainText("Invoice", { timeout: 60_000 });
  }

  test.describe(`Signed / Booked line (${role})`, () => {
    test("S60: an event with an active signature shows Signed with the date, the time with its zone and the signer's name", async ({
      page,
    }) => {
      const booking = await seed("signed");
      await addSignature(booking.eventId, { status: "active", pdf: "none", signedAt: SIGNED_AT });

      await open(page, booking);
      await expect(secondLine(page, "Signed")).toHaveText(
        lineText("Signed", SIGNED_TEXT, "E2E Signer"),
        { timeout: 60_000 },
      );
      // The Account Manager stays on the right of the strip.
      await expect(strip(page)).toContainText("Account Manager");
    });

    test("S61: a booked event with no signature and a status log row shows Booked with that row's time and the manager's name", async ({
      page,
    }) => {
      const booking = await seed("booked-log");
      const manager = await aStaffMember();
      await addBookedLog(booking.eventId, { userUuid: manager.id, at: BOOKED_AT });

      await open(page, booking);
      // The row's time, not the event's own booked_at (which is the moment of the seeding).
      await expect(secondLine(page, "Booked")).toHaveText(
        lineText("Booked", BOOKED_TEXT, manager.name),
        { timeout: 60_000 },
      );
      await expect(secondLine(page, "Signed")).toHaveCount(0);
    });

    test("S62: with both a signature and a booked log row, the line is Signed", async ({
      page,
    }) => {
      const booking = await seed("both");
      const manager = await aStaffMember();
      await addSignature(booking.eventId, { status: "active", pdf: "none", signedAt: SIGNED_AT });
      await addBookedLog(booking.eventId, { userUuid: manager.id, at: BOOKED_AT });

      await open(page, booking);
      await expect(secondLine(page, "Signed")).toHaveText(
        lineText("Signed", SIGNED_TEXT, "E2E Signer"),
        { timeout: 60_000 },
      );
      await expect(secondLine(page, "Booked")).toHaveCount(0);
    });

    test("S63: a booked event with no log row shows Booked with the booked_at time and no name", async ({
      page,
    }) => {
      const booking = await seed("booked-at");

      await open(page, booking);
      // The seeding stamps booked_at with its own moment and writes no log row: a time, no "by".
      await expect(secondLine(page, "Booked")).toHaveText(
        lineText("Booked", new RegExp(ANY_MOMENT)),
        { timeout: 60_000 },
      );
    });

    test("S64: an event that is not booked and has no active signature shows no second line", async ({
      page,
    }) => {
      const booking = await seed("not-booked", "quoted");
      const manager = await aStaffMember();
      // The signature was invalidated, and an old booking is still in the log: neither counts.
      await addSignature(booking.eventId, {
        status: "invalidated",
        pdf: "none",
        signedAt: SIGNED_AT,
      });
      await addBookedLog(booking.eventId, { userUuid: manager.id, at: BOOKED_AT });

      await open(page, booking);
      await expect(information(page).getByRole("region", { name: "Task History" })).toBeVisible({
        timeout: 60_000,
      });
      await expect(anySecondLine(page)).toHaveCount(0);
      // The rest of the strip is as before.
      await expect(strip(page)).toContainText("Account Manager");
    });

    test("S64: an event whose signature was invalidated and that is booked again by hand shows Booked", async ({
      page,
    }) => {
      const booking = await seed("rebooked");
      const manager = await aStaffMember();
      await addSignature(booking.eventId, {
        status: "invalidated",
        pdf: "none",
        signedAt: SIGNED_AT,
      });
      await addBookedLog(booking.eventId, { userUuid: manager.id, at: BOOKED_AT });

      await open(page, booking);
      await expect(secondLine(page, "Booked")).toHaveText(
        lineText("Booked", BOOKED_TEXT, manager.name),
        { timeout: 60_000 },
      );
      await expect(secondLine(page, "Signed")).toHaveCount(0);
    });
  });
}
