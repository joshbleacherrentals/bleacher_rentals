import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RepairStatusMenu } from "./RepairStatusMenu";

// docs/specs/repairs-08-status.md §2.2 and §7. The menu is a Radix dropdown whose list is drawn in a
// portal, so a closed menu is what the server renders: the trigger is under test here, and the six
// entries are tested through `statusMenuEntries` (utils/repairStatus.test.ts).

const render = (status: string, repairLabel = "repair JJ-5") =>
  renderToStaticMarkup(
    <RepairStatusMenu status={status} repairLabel={repairLabel} onChange={() => {}} />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("RepairStatusMenu trigger", () => {
  it("is one button that opens a menu, with the test id of the menu", () => {
    const markup = render("in_repair");
    expect(markup.match(/<button/g)).toHaveLength(1);
    expect(markup).toContain('data-testid="repair-status-menu"');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(markup).toContain('type="button"');
  });

  it("draws the pill of the status with its word and its colours, and a chevron", () => {
    const markup = render("in_repair");
    expect(text(markup)).toBe("In repair");
    expect(markup).toContain("bg-[#fde6d2]");
    expect(markup).toContain("<svg");
  });

  it("names the repair and the current status in its aria-label", () => {
    expect(render("in_repair")).toContain(
      'aria-label="Change status of repair JJ-5, now In repair"',
    );
    expect(render("completed", "repair of bleacher #52, #53")).toContain(
      'aria-label="Change status of repair of bleacher #52, #53, now Completed"',
    );
    expect(render("inbound", "repair")).toContain(
      'aria-label="Change status of repair, now Inbound"',
    );
  });

  it("shows the stored word in grey for a status the code does not know", () => {
    const markup = render("archived");
    expect(text(markup)).toBe("archived");
    expect(markup).toContain("bg-[#f3f4f6]");
    expect(markup).toContain('aria-label="Change status of repair JJ-5, now archived"');
  });

  it("does not draw the menu list while it is closed", () => {
    const words = text(render("inbound"));
    expect(words).not.toContain("Triaged");
    expect(words).not.toContain("Confirm repair");
  });
});
