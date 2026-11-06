import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { mockForm } = vi.hoisted(() => ({ mockForm: vi.fn() }));

// The form has its own test; here only the window around it.
vi.mock("./NextTaskForm", () => ({
  NextTaskForm: (props: unknown) => {
    mockForm(props);
    return <div data-testid="next-task-form" />;
  },
}));

import { NewTaskWindow } from "./NewTaskWindow";

// docs/specs/accountant-collections-14-new-task-window.md §3 and §5. Static markup: the gestures
// are Playwright's (S30–S37).

const render = () =>
  renderToStaticMarkup(<NewTaskWindow eventId="evt-1" today="2026-11-10" onClose={() => {}} />);

const tag = (html: string, pattern: RegExp) => pattern.exec(html)?.[0] ?? "";

beforeEach(() => {
  mockForm.mockReset();
});

describe("NewTaskWindow", () => {
  it("is a dialog that is not modal, named by its title", () => {
    const html = render();
    const dialog = tag(html, /<div[^>]*role="dialog"[^>]*>/);
    expect(dialog).toContain('aria-modal="false"');
    const labelledBy = /aria-labelledby="([^"]+)"/.exec(dialog)?.[1];
    expect(labelledBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`<h2[^>]*id="${labelledBy}"[^>]*>New Task</h2>`));
  });

  it("is fixed above the sticky header and below the app's dialogs", () => {
    const dialog = tag(render(), /<div[^>]*role="dialog"[^>]*>/);
    expect(dialog).toMatch(/class="[^"]*\bfixed\b/);
    expect(dialog).toMatch(/class="[^"]*\bz-40\b/);
  });

  it("opens at the design's place and size", () => {
    const dialog = tag(render(), /<div[^>]*role="dialog"[^>]*>/);
    expect(dialog).toMatch(/style="[^"]*left:730px/);
    expect(dialog).toMatch(/style="[^"]*top:250px/);
    expect(dialog).toMatch(/style="[^"]*width:430px/);
    expect(dialog).toMatch(/style="[^"]*height:360px/);
  });

  it("has a title bar with a grip, the title and a close button", () => {
    const html = render();
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*aria-label="Close New Task window"|<button[^>]*aria-label="Close New Task window"[^>]*type="button"/,
    );
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf(">New Task</h2>"));
    expect(html.indexOf(">New Task</h2>")).toBeLessThan(
      html.indexOf('aria-label="Close New Task window"'),
    );
  });

  it("has three resize handles, outside the tab order, in plain words", () => {
    const html = render();
    for (const label of ["Resize window width", "Resize window height", "Resize window"]) {
      const handle = tag(html, new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`));
      expect(handle, label).toContain('tabindex="-1"');
      expect(handle, label).toContain('type="button"');
    }
    expect(html.match(/aria-label="Resize window[^"]*"/g)).toHaveLength(3);
  });

  it("draws no overlay: nothing dimmed and no second fixed layer", () => {
    const html = render();
    expect(html).not.toMatch(/inset-0/);
    expect(html).not.toMatch(/bg-black\/\d+/);
    expect(html).not.toContain('data-slot="dialog-overlay"');
    expect(html.match(/\bfixed\b/g)).toHaveLength(1);
  });

  it("holds the form, given the event, today, and a way to close", () => {
    const onClose = vi.fn();
    const html = renderToStaticMarkup(
      <NewTaskWindow eventId="evt-1" today="2026-11-10" onClose={onClose} />,
    );
    expect(html).toContain('data-testid="next-task-form"');
    expect(mockForm).toHaveBeenCalledTimes(1);
    expect(mockForm).toHaveBeenCalledWith({
      eventId: "evt-1",
      today: "2026-11-10",
      onSaved: onClose,
    });
  });
});
