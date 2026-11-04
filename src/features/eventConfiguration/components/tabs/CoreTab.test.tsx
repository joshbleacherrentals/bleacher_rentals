import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/dashboard-events-read-only.md §3.3, D10 and §7. Every field of the Core tab is on
// screen and cannot be changed, yet the two "locate" buttons (scroll the grid to a date) still work
// for everyone: they navigate, they do not edit.

const mocks = vi.hoisted(() => ({ event: {} as Record<string, unknown> }));

vi.mock("../../state/useCurrentEventStore", () => ({
  useCurrentEventStore: Object.assign(() => mocks.event, { getState: () => mocks.event }),
}));
vi.mock("@/features/dashboard/db/hooks/powersync/usePsUsers", () => ({
  usePsUsers: () => [{ id: "user-1", first_name: "Dana", last_name: "Whitfield", email: null }],
}));
vi.mock("@/features/dashboard/state/useScrollToDateStore", () => ({
  useScrollToDateStore: (select: (s: { scrollToDate: () => void }) => unknown) =>
    select({ scrollToDate: () => {} }),
}));
vi.mock("@/components/VenuePicker", () => ({
  VenuePicker: () => <div data-venue-picker="" />,
}));

import { CoreTab } from "./CoreTab";

const event = (over: Record<string, unknown> = {}) => ({
  eventUuid: "ev-1",
  eventName: "County Fair",
  addressData: null,
  venueUuid: null,
  venueName: "",
  eventStart: "2026-10-01",
  eventEnd: "2026-10-03",
  setupStart: "2026-09-30",
  teardownEnd: "2026-10-04",
  sameDaySetup: true,
  sameDayTeardown: true,
  goodshuffleUrl: null,
  ownerUserUuid: "user-1",
  originalOwnerUserUuid: "user-1",
  isFormExpanded: true,
  bleacherUuids: [],
  setField: vi.fn(),
  ...over,
});

const tags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
const isDisabled = (openTag: string) => /\sdisabled(=|\s|>)/.test(openTag);
const isLocate = (openTag: string) => openTag.includes('title="Scroll dashboard to this date"');

beforeEach(() => {
  mocks.event = event();
});

describe("CoreTab", () => {
  it.each([false, true])(
    "locks every field and keeps the locate buttons (setup and teardown shown: %s)",
    (showSetupTeardown) => {
      const html = renderToStaticMarkup(<CoreTab showSetupTeardown={showSetupTeardown} />);

      const inputs = tags(html, "input");
      expect(inputs.length).toBeGreaterThanOrEqual(showSetupTeardown ? 6 : 4);
      for (const input of inputs) expect(isDisabled(input), input).toBe(true);

      const buttons = tags(html, "button");
      const locate = buttons.filter(isLocate);
      expect(locate).toHaveLength(2);
      for (const button of locate) expect(isDisabled(button), button).toBe(false);
      // Whatever else is a button (the owner dropdown) is locked.
      for (const button of buttons.filter((b) => !isLocate(b))) {
        expect(isDisabled(button), button).toBe(true);
      }
    },
  );

  it("locks the venue picker, with its search and its create and edit buttons", () => {
    const html = renderToStaticMarkup(<CoreTab showSetupTeardown={false} />);

    expect(html).toMatch(/<fieldset[^>]*\sdisabled[^>]*>\s*<div data-venue-picker=""/);
  });

  it("shows the owner by name, though nobody can change it", () => {
    const html = renderToStaticMarkup(<CoreTab showSetupTeardown={false} />);

    expect(html).toContain("Dana Whitfield");
  });

  it("keeps a locate button off while its date is empty", () => {
    mocks.event = event({ eventStart: "", eventEnd: "" });
    const html = renderToStaticMarkup(<CoreTab showSetupTeardown={false} />);

    for (const button of tags(html, "button").filter(isLocate)) {
      expect(isDisabled(button), button).toBe(true);
    }
  });
});
