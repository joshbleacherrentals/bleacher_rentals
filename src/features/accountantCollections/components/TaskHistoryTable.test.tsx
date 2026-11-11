import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// The delete is wired to the local database and to the toast; the table is drawn without either.
vi.mock("../db/deleteTask", () => ({ deleteClosedTask: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToastNoThrow: vi.fn() }));

import { invoiceDataFixture } from "./invoiceFixtures";
import { TaskHistoryTable } from "./TaskHistoryTable";

// Spec: docs/specs/accountant-collections-13-task-history-and-files.md §1, §3, §5 and §7;
// docs/specs/accountant-collections-18-task-finished-at.md §3 and §5 (the Finished at column);
// docs/specs/accountant-collections-19-task-delete.md §3 and §5 (the Actions column, the delete
// button on a closed row, five columns).

const fixture = invoiceDataFixture().tasks;

const render = (tasks = fixture) => renderToStaticMarkup(<TaskHistoryTable tasks={tasks} />);

/** The cells of the body rows, one array per row. */
function bodyRows(html: string): string[][] {
  const body = /<tbody>([^]*)<\/tbody>/.exec(html)?.[1] ?? "";
  return [...body.matchAll(/<tr[^>]*>([^]*?)<\/tr>/g)].map((row) =>
    [...row[1].matchAll(/<td[^>]*>([^]*?)<\/td>/g)].map((cell) =>
      cell[1].replace(/<[^>]+>/g, "").trim(),
    ),
  );
}

/** The text of the column headers, tags out. */
const headersOf = (html: string) =>
  [...html.matchAll(/<th[^>]*scope="col"[^>]*>([^]*?)<\/th>/g)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").trim(),
  );

describe("TaskHistoryTable", () => {
  it("is the section Task History, with the columns #, Finished at, Due Date, Note and Actions", () => {
    const html = render();
    expect(html).toContain('aria-label="Task History"');
    expect(html).toMatch(/<h3[^>]*>Task History<\/h3>/);
    expect(headersOf(html)).toEqual(["#", "Finished at", "Due Date", "Note", "Actions"]);
  });

  it("lists the completed tasks oldest first, then the open task, numbered", () => {
    // The last cell is the Actions one: a button with no text, and nothing on the open row.
    expect(bodyRows(render())).toEqual([
      ["1", "—", "10 days ago", "Send a follow up message to the customer", ""],
      ["2", "08/11/2026", "3 days ago", "Call to the customer and ask about payment", ""],
      [
        "3",
        "—",
        "Due Today",
        "Called again to follow up and he said the check was sent yesterday.Open",
        "",
      ],
    ]);
  });

  it("marks only the open task with a small blue Open tag after its note", () => {
    const html = render();
    expect(html.match(/>Open</g)).toHaveLength(1);
    const openRow = /<tr[^>]*>(?:(?!<\/tr>)[^])*Called again(?:(?!<\/tr>)[^])*<\/tr>/.exec(
      html,
    )?.[0];
    expect(openRow).toMatch(/<span[^>]*text-lightBlue[^>]*>Open<\/span>/);
    expect(openRow!.indexOf("Called again")).toBeLessThan(openRow!.indexOf(">Open<"));
  });

  it("has no Open tag when no task is open", () => {
    const html = render({ open: null, completed: fixture.completed });
    expect(html).not.toContain(">Open<");
    expect(bodyRows(html)).toHaveLength(2);
  });

  it("lists only the open task when nothing is completed", () => {
    const html = render({ open: fixture.open, completed: [] });
    expect(bodyRows(html)).toHaveLength(1);
    expect(html).toContain(">Open<");
  });

  it("says No tasks yet. in one row when the event has none", () => {
    const html = render({ open: null, completed: [] });
    expect(bodyRows(html)).toEqual([["No tasks yet."]]);
    expect(html).toMatch(/<td[^>]*colSpan="5"[^>]*>No tasks yet\.<\/td>/);
  });

  it("writes Finished at as a date, not in words, and keeps the Due Date column in words", () => {
    const rows = bodyRows(render());
    expect(rows[1][1]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(rows[1][2]).toBe("3 days ago");
  });

  it("draws a dash in grey, and a date in the normal colour", () => {
    const html = render();
    const cells = [...html.matchAll(/<td[^>]*>([^]*?)<\/td>/g)];
    const finished = cells.filter((_, i) => i % 5 === 1);
    const dash = finished.find((c) => c[1].includes("—"))![0];
    const date = finished.find((c) => c[1].includes("08/11/2026"))![0];
    expect(dash).toContain("text-gray-500");
    expect(date).not.toContain("text-gray-500");
  });

  it("is wide enough for the extra columns: 640 px, as in the design", () => {
    const html = render();
    expect(html).toContain("min-w-[640px]");
    expect(html).not.toContain("min-w-[560px]");
  });

  it("keeps the old Tasks tab's panels and button out", () => {
    const html = render();
    expect(html).not.toContain("Task list");
    expect(html).not.toContain("Current task due now");
    expect(html).not.toContain("Done / Next Task");
    expect(html).not.toContain("No open task");
  });

  it("does not change the tasks it was given", () => {
    const tasks = invoiceDataFixture().tasks;
    render(tasks);
    expect(tasks.completed.map((t) => t.id)).toEqual(["task-1", "task-2"]);
  });
});

// docs/specs/accountant-collections-19-task-delete.md §1, §3 and §5.
describe("TaskHistoryTable: the delete button", () => {
  /** The cells of the body rows as markup, one array per row. */
  function bodyCells(html: string): string[][] {
    const body = /<tbody>([^]*)<\/tbody>/.exec(html)?.[1] ?? "";
    return [...body.matchAll(/<tr[^>]*>([^]*?)<\/tr>/g)].map((row) =>
      [...row[1].matchAll(/<td[^>]*>([^]*?)<\/td>/g)].map((cell) => cell[1]),
    );
  }
  const deleteButtons = (html: string) => [
    ...html.matchAll(/<button[^>]*aria-label="Delete task \d+"[^>]*>/g),
  ];

  it("hides the Actions header from the eye but not from a screen reader", () => {
    const html = render();
    expect(html).toMatch(
      /<th[^>]*scope="col"[^>]*>\s*<span class="sr-only">Actions<\/span>\s*<\/th>/,
    );
  });

  it("puts a button on every closed row and none on the open row", () => {
    const html = render();
    const rows = bodyCells(html);
    expect(rows).toHaveLength(3);
    expect(rows[0][4]).toContain('aria-label="Delete task 1"');
    expect(rows[1][4]).toContain('aria-label="Delete task 2"');
    expect(rows[2][4]).toBe("");
    expect(deleteButtons(html)).toHaveLength(2);
  });

  it("names each button by the number of its row, with the title Delete task", () => {
    const html = render();
    for (const n of [1, 2]) {
      const button = new RegExp(`<button[^>]*aria-label="Delete task ${n}"[^>]*>`).exec(html)![0];
      expect(button).toContain('title="Delete task"');
      expect(button).toContain('type="button"');
    }
  });

  it("draws the button 32 px square with a red trash icon, as the Files delete", () => {
    const button = deleteButtons(render())[0][0];
    expect(button).toContain("size-8");
    expect(button).toContain("text-[#a8403a]");
    expect(render()).toMatch(
      /<button[^>]*aria-label="Delete task 1"[^>]*><svg[^>]*aria-hidden="true"/,
    );
  });

  it("has no button when no task is closed", () => {
    const html = render({ open: fixture.open, completed: [] });
    expect(deleteButtons(html)).toHaveLength(0);
    expect(bodyCells(html)[0]).toHaveLength(5);
  });

  it("has a button on every row when no task is open", () => {
    const html = render({ open: null, completed: fixture.completed });
    expect(deleteButtons(html)).toHaveLength(2);
  });

  it("numbers the buttons like the rows, so the window can say Task #N", () => {
    const html = render();
    const numbers = bodyCells(html).map((cells) => cells[0].trim());
    expect(numbers).toEqual(["1", "2", "3"]);
    expect(deleteButtons(html).map((m) => /Delete task (\d+)/.exec(m[0])![1])).toEqual(["1", "2"]);
  });

  it("does not draw the window until a button is pressed", () => {
    const html = render();
    expect(html).not.toContain("Are you sure?");
    expect(html).not.toContain('role="dialog"');
  });
});
