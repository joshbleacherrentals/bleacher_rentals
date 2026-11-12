import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The booked date button on the quote page. What it draws for a stored `booked_at`, and what a
// click on a day of its calendar does (saveBookedDay). The calendar itself is in
// TaskDatePicker.test.tsx; the write and its Log row are in changeBookedAt.test.ts.

const mocks = vi.hoisted(() => ({
  timezone: "America/Toronto",
  changeBookedAt: vi.fn(),
  errorToast: vi.fn(),
}));

vi.mock("@/lib/useTimezoneStore", () => ({
  useTimezoneStore: (select: (s: { timezone: string }) => unknown) =>
    select({ timezone: mocks.timezone }),
}));
vi.mock("../../db/changeBookedAt", () => ({
  changeBookedAt: (...args: unknown[]) => mocks.changeBookedAt(...args),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToastNoThrow: (...args: unknown[]) => mocks.errorToast(...args),
}));

import { BookedAtButton, saveBookedDay } from "./BookedAtButton";

const supabase = {} as never;

const render = (bookedAt: string | null) =>
  renderToStaticMarkup(
    <BookedAtButton eventId="ev-1" bookedAt={bookedAt} supabase={supabase} userId="user-1" />,
  );

beforeEach(() => {
  mocks.timezone = "America/Toronto";
  mocks.changeBookedAt.mockReset();
  mocks.errorToast.mockReset();
});

describe("BookedAtButton", () => {
  it("shows the booked day on a button: Booked: Nov 12, 2026", () => {
    const html = render("2026-11-12T17:00:00.000Z");
    expect(html).toMatch(/<button[^>]*>[^]*Booked: Nov 12, 2026[^]*<\/button>/);
  });

  it("shows a dash when the quote has no booked_at", () => {
    expect(render(null)).toContain("Booked: —");
  });

  it("shows the day in the app's timezone, the one the day is picked in", () => {
    // 22:30 on 12 Nov in Toronto is already 13 Nov in UTC.
    expect(render("2026-11-13T03:30:00.000Z")).toContain("Booked: Nov 12, 2026");

    mocks.timezone = "UTC";
    expect(render("2026-11-13T03:30:00.000Z")).toContain("Booked: Nov 13, 2026");
  });

  it("is a bordered button like the ones beside it, with a calendar icon", () => {
    const html = render("2026-11-12T17:00:00.000Z");
    // The same look as Open in Dashboard in QuoteActionBar.
    expect(html).toContain("text-gray-700 border border-gray-300 rounded-sm hover:bg-gray-50");
    expect(html).toContain("<svg");
  });

  it("opens a calendar window, drawn only once it is opened", () => {
    const html = render("2026-11-12T17:00:00.000Z");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Next month");
  });
});

describe("saveBookedDay", () => {
  const params = {
    eventId: "ev-1",
    bookedAt: "2026-11-05T22:43:00.000Z",
    day: "2026-11-12",
    timezone: "America/Toronto",
    supabase,
    userId: "user-1",
  };

  it("saves the chosen day for the quote, from what it has now, as the user and in the app's timezone", async () => {
    mocks.changeBookedAt.mockResolvedValue(true);

    expect(await saveBookedDay(params)).toBe(true);
    expect(mocks.changeBookedAt).toHaveBeenCalledWith(
      {
        eventId: "ev-1",
        from: "2026-11-05T22:43:00.000Z",
        day: "2026-11-12",
        timezone: "America/Toronto",
      },
      supabase,
      "user-1",
    );
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });

  it("counts the day already there as done, without a toast: nothing was written, nothing is wrong", async () => {
    mocks.changeBookedAt.mockResolvedValue(false);

    expect(await saveBookedDay(params)).toBe(true);
    expect(mocks.errorToast).not.toHaveBeenCalled();
  });

  it("shows only an error toast, with the error's text, when it fails", async () => {
    mocks.changeBookedAt.mockRejectedValue(new Error("write failed"));

    expect(await saveBookedDay(params)).toBe(false);
    expect(mocks.errorToast).toHaveBeenCalledWith(["write failed"]);
  });

  it("gives a plain error text when the failure has none", async () => {
    mocks.changeBookedAt.mockRejectedValue(new Error(""));

    expect(await saveBookedDay(params)).toBe(false);
    expect(mocks.errorToast).toHaveBeenCalledWith(["Could not change the booked date."]);
  });
});
