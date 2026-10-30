import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { invoiceDataFixture } from "./invoiceFixtures";
import { InvoiceTasks } from "./InvoiceTasks";

const tasks = invoiceDataFixture().tasks;

const render = (over: Partial<React.ComponentProps<typeof InvoiceTasks>> = {}) =>
  renderToStaticMarkup(<InvoiceTasks eventId="evt-1" tasks={tasks} today="2026-11-10" {...over} />);

describe("InvoiceTasks", () => {
  it("lists the completed tasks with their relative date and note, in the order given", () => {
    const html = render();
    expect(html).toContain("Task list");
    expect(html).toContain("3 days ago");
    expect(html).toContain("Call to the customer and ask about payment");
    expect(html).toContain("10 days ago");
    expect(html).toContain("Send a follow up message to the customer");
    expect(html.indexOf("3 days ago")).toBeLessThan(html.indexOf("10 days ago"));
  });

  it("shows the current task with its Done / Next Task button", () => {
    const html = render();
    expect(html).toContain("Current task due now");
    expect(html).toContain("Called again to follow up and he said the check was sent yesterday.");
    expect(html).toMatch(/<button[^>]*>Done \/ Next Task<\/button>/);
    expect(html).not.toContain("No open task");
  });

  it("says No open task, with no Done / Next Task button, when nothing is open", () => {
    const html = render({ tasks: { open: null, completed: tasks.completed } });
    expect(html).toContain("No open task");
    expect(html).not.toContain("Done / Next Task");
  });

  it("still lists the completed tasks when nothing is open", () => {
    const html = render({ tasks: { open: null, completed: tasks.completed } });
    expect(html).toContain("Call to the customer and ask about payment");
  });

  it("says so when no task has been completed yet", () => {
    const html = render({ tasks: { open: tasks.open, completed: [] } });
    expect(html).toContain("No completed tasks yet.");
  });
});
