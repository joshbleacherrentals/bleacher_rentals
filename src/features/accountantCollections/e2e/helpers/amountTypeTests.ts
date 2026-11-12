import { test, expect, type Locator, type Page } from "@playwright/test";
import {
  addInstallments,
  addPayment,
  cleanupBookings,
  createOverdueBooking,
  type SeededBooking,
} from "./collectionsFixtures";

/**
 * The Collections / Deposits / All switch on the Collections tab
 * (docs/specs/accountant-collections-23-amount-type-switch.md §4, S72 to S78), written once and run
 * as the accountant and as the administrator by `amountType.accountant.spec.ts` and
 * `amountType.admin.spec.ts`.
 *
 * The events are the user's (§1), each a $1,000.00 quote unless said otherwise. A payment schedule
 * is "40% / 30% / 30%" of it; the first payment is the oldest. A payment of $400.00 pays the first
 * installment in full (a payment names no installment, so it pays from the oldest on).
 *
 * Every event has an open task due today (unless a step says otherwise), so what decides whether a
 * row is listed is its type, not whether the nightly sync has made its task yet.
 *
 * Written, not run locally (project rule). The data is written with the service role by
 * ./collectionsFixtures.ts and removed at the end.
 */

const stamp = Date.now();
const params = (page: Page) => new URL(page.url()).searchParams;

type Installment = { dueInDays: number; percentageBps: number };

/** A schedule of three: 40%, 30% and 30%, the first due 30 days ago. */
const three = (second: number, third: number): Installment[] => [
  { dueInDays: -30, percentageBps: 4000 },
  { dueInDays: second, percentageBps: 3000 },
  { dueInDays: third, percentageBps: 3000 },
];
/** A schedule of three with every payment overdue. */
const ALL_OVERDUE = three(-14, -7);

export function defineAmountTypeTests(role: "accountant" | "admin") {
  const seeded: SeededBooking[] = [];

  async function seed(
    suffix: string,
    options: {
      startInDays?: number;
      schedule?: Installment[];
      paidCents?: number;
      valueCents?: number;
      taskDueInDays?: number;
    } = {},
  ) {
    const booking = await createOverdueBooking({
      name: `E2E Amount Type ${role} ${suffix} ${stamp}`,
      taskDueInDays: options.taskDueInDays ?? 0,
      startInDays: options.startInDays,
      valueCents: options.valueCents,
    });
    seeded.push(booking);
    if (options.schedule) await addInstallments(booking.eventId, options.schedule);
    if (options.paidCents) await addPayment(booking.eventId, options.paidCents);
    return booking;
  }

  test.afterAll(async () => {
    await cleanupBookings(seeded.map((b) => b.eventId));
  });

  /** The link to an event's invoice in the list. */
  const link = (page: Page, booking: SeededBooking) =>
    page.getByRole("link", { name: booking.name });
  /** The switch: its accessible name says which type it shows. */
  const switchOf = (page: Page) => page.getByRole("button", { name: /^Showing: / });
  const showing = (page: Page, label: "Collections" | "Deposits" | "All") =>
    page.getByRole("button", { name: new RegExp(`^Showing: ${label}\\.`) });
  /** The Amount Overdue cell (the fifth) of an event's row. */
  const amountOverdue = (page: Page, booking: SeededBooking): Locator =>
    page
      .getByRole("row")
      .filter({ has: link(page, booking) })
      .locator("td")
      .nth(4);

  /** Opens the list with `query` and waits until an event that must be there has appeared. */
  async function openList(page: Page, query: string, proof: SeededBooking) {
    await page.goto(`/accountant?tab=collections${query}`);
    await expect(link(page, proof)).toBeVisible({ timeout: 60_000 });
  }

  test.describe(`The Collections / Deposits / All switch (${role})`, () => {
    test("S72: the tab opens on Collections with no type in the address: A and E are listed, D is not", async ({
      page,
    }) => {
      // A: a schedule of three, the first paid, the second overdue a week, the third due today.
      const a = await seed("72-a", { schedule: three(-7, 0), paidCents: 40_000 });
      // E: a schedule of one payment, overdue today; the event starts in five days.
      const e = await seed("72-e", {
        schedule: [{ dueInDays: 0, percentageBps: 10_000 }],
        startInDays: 5,
      });
      // D: the same as A, but the third payment becomes due only in a week.
      const d = await seed("72-d", { schedule: three(-7, 7), paidCents: 40_000 });

      await openList(page, "", a);
      await expect(showing(page, "Collections")).toBeVisible();
      await expect(showing(page, "Collections")).toHaveClass(/from-\[#2f6fb8\]/);
      expect(params(page).has("type")).toBe(false);
      await expect(link(page, e)).toBeVisible();
      await expect(amountOverdue(page, a)).toHaveText("$600.00");
      await expect(amountOverdue(page, e)).toHaveText("$1,000.00");
      await expect(link(page, d)).toHaveCount(0);
    });

    test("S73: a click steps Collections, Deposits, All and Collections again; the address, the label, the colour and the list follow", async ({
      page,
    }) => {
      const collections = await seed("73-collections", {
        schedule: three(-7, 0),
        paidCents: 40_000,
      });
      const deposits = await seed("73-deposits", { schedule: three(-7, 7), paidCents: 40_000 });

      await openList(page, "", collections);
      await expect(link(page, deposits)).toHaveCount(0);

      await switchOf(page).click();
      await expect.poll(() => params(page).get("type")).toBe("deposits");
      await expect(showing(page, "Deposits")).toBeVisible();
      await expect(showing(page, "Deposits")).toHaveClass(/from-\[#0e7f61\]/);
      await expect(link(page, deposits)).toBeVisible();
      await expect(link(page, collections)).toHaveCount(0);

      await switchOf(page).click();
      await expect.poll(() => params(page).get("type")).toBe("all");
      await expect(showing(page, "All")).toBeVisible();
      await expect(showing(page, "All")).toHaveClass(/from-\[#6b7280\]/);
      await expect(link(page, deposits)).toBeVisible();
      await expect(link(page, collections)).toBeVisible();

      await switchOf(page).click();
      await expect.poll(() => params(page).has("type")).toBe(false);
      await expect(showing(page, "Collections")).toBeVisible();
      await expect(link(page, collections)).toBeVisible();
      await expect(link(page, deposits)).toHaveCount(0);
      expect(params(page).get("tab")).toBe("collections");
    });

    test("S74: a link with type=deposits opens on Deposits, type=all on All, type=collections and an unknown type on Collections", async ({
      page,
    }) => {
      const collections = await seed("74-collections", {
        schedule: three(-7, 0),
        paidCents: 40_000,
      });
      const deposits = await seed("74-deposits", { schedule: three(-7, 7), paidCents: 40_000 });

      await openList(page, "&type=deposits", deposits);
      await expect(showing(page, "Deposits")).toBeVisible();
      await expect(link(page, collections)).toHaveCount(0);

      await openList(page, "&type=all", deposits);
      await expect(showing(page, "All")).toBeVisible();
      await expect(link(page, collections)).toBeVisible();

      await openList(page, "&type=collections", collections);
      await expect(showing(page, "Collections")).toBeVisible();
      await expect(link(page, deposits)).toHaveCount(0);

      // An unknown value reads as Collections and is left in the address.
      await openList(page, "&type=bogus", collections);
      await expect(showing(page, "Collections")).toBeVisible();
      await expect(link(page, deposits)).toHaveCount(0);
      expect(params(page).get("type")).toBe("bogus");
    });

    test("S75: Deposits A is listed under Deposits and not under Collections; Deposits B, with all three payments overdue, under Collections and not under Deposits", async ({
      page,
    }) => {
      // A: the first paid, the second overdue, the third only in a week.
      const a = await seed("75-a", { schedule: three(-7, 7), paidCents: 40_000 });
      // B: all three payments overdue.
      const b = await seed("75-b", { schedule: ALL_OVERDUE });

      await openList(page, "&type=deposits", a);
      await expect(amountOverdue(page, a)).toHaveText("$300.00");
      await expect(link(page, b)).toHaveCount(0);

      await openList(page, "", b);
      await expect(amountOverdue(page, b)).toHaveText("$1,000.00");
      await expect(link(page, a)).toHaveCount(0);
    });

    test("S76: money received: all overdue and part of the first paid is Collections; the first paid in full and the other two overdue is Collections; one payment not yet due is Deposits", async ({
      page,
    }) => {
      const partOfFirst = await seed("76-part", { schedule: ALL_OVERDUE, paidCents: 10_000 });
      const firstInFull = await seed("76-first", { schedule: ALL_OVERDUE, paidCents: 40_000 });
      const oneNotDue = await seed("76-not-due", {
        schedule: three(-7, 10),
        paidCents: 10_000,
      });

      await openList(page, "", partOfFirst);
      await expect(amountOverdue(page, partOfFirst)).toHaveText("$900.00");
      await expect(link(page, firstInFull)).toBeVisible();
      await expect(amountOverdue(page, firstInFull)).toHaveText("$600.00");
      await expect(link(page, oneNotDue)).toHaveCount(0);

      await openList(page, "&type=deposits", oneNotDue);
      await expect(amountOverdue(page, oneNotDue)).toHaveText("$600.00");
      await expect(link(page, partOfFirst)).toHaveCount(0);
      await expect(link(page, firstInFull)).toHaveCount(0);
    });

    test("S77: from the Deposits list an invoice is opened; Back to tasks returns to type=deposits and Previous / Next Task walk only the Deposits list", async ({
      page,
    }) => {
      // Amounts 10 cents apart, in the range the other Collections specs leave alone. A Deposits
      // event owes half of its quote now (the first payment is overdue, the second in a week).
      const half: Installment[] = [
        { dueInDays: -7, percentageBps: 5000 },
        { dueInDays: 7, percentageBps: 5000 },
      ];
      const big = await seed("77-big", { schedule: half, valueCents: 2 * 9_100_030 });
      // A Collections event between the two in amount order: it owes 9_100_020 cents, all of it.
      const between = await seed("77-between", { valueCents: 9_100_020 });
      const small = await seed("77-small", { schedule: half, valueCents: 2 * 9_100_010 });
      const sorted = "&type=deposits&csort=amount&cdir=desc";

      await openList(page, sorted, big);
      await expect(link(page, between)).toHaveCount(0);

      await link(page, big).click();
      await expect(page).toHaveURL(new RegExp(`id=${big.eventId}`));
      expect(params(page).get("type")).toBe("deposits");
      await expect(page.getByRole("heading", { name: big.name })).toBeVisible({
        timeout: 60_000,
      });

      // Next Task skips the Collections event that sits between the two in amount order.
      await page.getByRole("link", { name: "Next Task" }).click();
      await expect(page).toHaveURL(new RegExp(`id=${small.eventId}`));
      expect(params(page).get("type")).toBe("deposits");
      await expect(page.getByRole("heading", { name: small.name })).toBeVisible();
      await page.getByRole("link", { name: "Previous Task" }).click();
      await expect(page).toHaveURL(new RegExp(`id=${big.eventId}`));

      await page.getByRole("link", { name: "Back to tasks" }).click();
      await expect(page).toHaveURL(/\/accountant\?/);
      expect(params(page).get("tab")).toBe("collections");
      expect(params(page).get("type")).toBe("deposits");
      expect(params(page).get("csort")).toBe("amount");
      await expect(showing(page, "Deposits")).toBeVisible();

      // An event outside the chosen type has both buttons dimmed.
      await page.goto(
        `/accountant/invoice?id=${between.eventId}&tab=info&type=deposits&csort=amount&cdir=desc`,
      );
      await expect(page.getByRole("heading", { name: between.name })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByRole("link", { name: "Previous Task" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(page.getByRole("link", { name: "Next Task" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    test("S78: with Show Not Due Yet on, a not-due task appears only in the type its figures belong to, and in All", async ({
      page,
    }) => {
      // Both tasks are dated in five days, so Show Not Due Yet has to be on to see them.
      const collections = await seed("78-collections", { taskDueInDays: 5 });
      const deposits = await seed("78-deposits", {
        taskDueInDays: 5,
        schedule: three(-7, 7),
        paidCents: 40_000,
      });
      // A control that is due today, to know the list has loaded.
      const control = await seed("78-control", {});

      await openList(page, "&cnotdue=1", collections);
      await expect(link(page, control)).toBeVisible();
      await expect(link(page, deposits)).toHaveCount(0);

      await openList(page, "&cnotdue=1&type=deposits", deposits);
      await expect(link(page, collections)).toHaveCount(0);

      await openList(page, "&cnotdue=1&type=all", deposits);
      await expect(link(page, collections)).toBeVisible();

      // Show Not Due Yet off hides both, in every type.
      await openList(page, "&type=all", control);
      await expect(link(page, collections)).toHaveCount(0);
      await expect(link(page, deposits)).toHaveCount(0);
    });
  });
}
