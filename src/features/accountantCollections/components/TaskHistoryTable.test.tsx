import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { invoiceDataFixture } from "./invoiceFixtures";
import { TaskHistoryTable } from "./TaskHistoryTable";

// Spec: docs/specs/accountant-collections-13-task-history-and-files.md §1, §3, §5 and §7;
// docs/specs/accountant-collections-18-task-finished-at.md §3 and §5 (the Finished at column).

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

describe("TaskHistoryTable", () => {
  it("is the section Task History, with the columns #, Finished at, Due Date and Note", () => {
    const html = render();
    expect(html).toContain('aria-label="Task History"');
    expect(html).toMatch(/<h3[^>]*>Task History<\/h3>/);
    const headers = [...html.matchAll(/<th[^>]*scope="col"[^>]*>([^<]*)</g)].map((m) =>
      m[1].trim(),
    );
    expect(headers).toEqual(["#", "Finished at", "Due Date", "Note"]);
  });

  it("lists the completed tasks oldest first, then the open task, numbered", () => {
    expect(bodyRows(render())).toEqual([
      ["1", "—", "10 days ago", "Send a follow up message to the customer"],
      ["2", "08/11/2026", "3 days ago", "Call to the customer and ask about payment"],
      [
        "3",
        "—",
        "Due Today",
        "Called again to follow up and he said the check was sent yesterday.Open",
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
    expect(html).toMatch(/<td[^>]*colSpan="4"[^>]*>No tasks yet\.<\/td>/);
  });

  it("writes Finished at as a date, not in words, and keeps the Due Date column in words", () => {
    const rows = bodyRows(render());
    expect(rows[1][1]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(rows[1][2]).toBe("3 days ago");
  });

  it("draws a dash in grey, and a date in the normal colour", () => {
    const html = render();
    const cells = [...html.matchAll(/<td[^>]*>([^]*?)<\/td>/g)];
    const finished = cells.filter((_, i) => i % 4 === 1);
    const dash = finished.find((c) => c[1].includes("—"))![0];
    const date = finished.find((c) => c[1].includes("08/11/2026"))![0];
    expect(dash).toContain("text-gray-500");
    expect(date).not.toContain("text-gray-500");
  });

  it("is wide enough for the extra column", () => {
    expect(render()).toContain("min-w-[560px]");
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
