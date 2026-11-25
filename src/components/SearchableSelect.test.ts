import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dialogOf } from "./SearchableSelect";

// The open list of a SearchableSelect is not drawn in a portal, so inside a dialog it is clipped by the
// dialog. The category list of the Add service window ran past the bottom of the window (the screen
// recordings of 2026-11-23): the search box and the list want about 340px, the window leaves 280px below
// the field. Radix measures the room for a list against the screen only, unless it is given a boundary
// (`collisionBoundary`): a first fix that capped the list to `--radix-popover-content-available-height`
// alone changed nothing, because that variable was 488px, the distance to the bottom of the screen. So
// the dialog is the boundary, and the list is capped to the room left in it and scrolls inside.
// Layout is not computed by Vitest's node environment (the numbers were read in Chromium), so this pins
// the classes and props that do it, and tests how the dialog is found.

const source = readFileSync(join(__dirname, "SearchableSelect.tsx"), "utf-8");

/** The opening tag of the first `<name ...>` in the source, from `<name` to its closing `>`. */
function openingTag(name: string): string {
  const start = source.indexOf(`<${name}`);
  expect(start, `<${name} is in SearchableSelect.tsx`).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let end = start; end < source.length; end += 1) {
    const ch = source[end];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return source.slice(start, end + 1);
  }
  throw new Error(`<${name} never closes`);
}

describe("the open list of SearchableSelect", () => {
  it("is no taller than the room Radix measures for it", () => {
    expect(openingTag("PopoverContent")).toContain(
      "max-h-(--radix-popover-content-available-height)",
    );
  });

  it("lets the search box stay and the list shrink and scroll when the room is short", () => {
    const content = openingTag("PopoverContent");
    expect(content).toMatch(/\bflex\b/);
    expect(content).toMatch(/\bflex-col\b/);
    expect(openingTag("Command")).toMatch(/\bmin-h-0\b/);
  });

  it("measures that room against the dialog it sits in, not against the screen", () => {
    expect(openingTag("PopoverContent")).toMatch(/collisionBoundary=\{boundary/);
    // The dialog is found from the trigger when the list opens.
    expect(source).toMatch(/if \(next\) setBoundary\(dialogOf\(triggerRef\.current\)\)/);
    expect(openingTag("Button")).toContain("ref={triggerRef}");
  });

  it("keeps a gap between the list and the edge of the dialog", () => {
    expect(openingTag("PopoverContent")).toMatch(/collisionPadding=\{\d+\}/);
  });

  it("still takes the width of its trigger and the layer a window gives it", () => {
    const content = openingTag("PopoverContent");
    expect(content).toContain("w-[--radix-popover-trigger-width]");
    expect(content).toContain("popoverClassName");
  });
});

describe("dialogOf", () => {
  const dialog = { id: "dialog" } as unknown as Element;
  const asking = (found: Element | null) => {
    const selectors: string[] = [];
    const trigger = {
      closest: (selector: string) => {
        selectors.push(selector);
        return found;
      },
    };
    return { trigger, selectors };
  };

  it("is the dialog the trigger sits in", () => {
    expect(dialogOf(asking(dialog).trigger)).toBe(dialog);
  });

  it("looks for a dialog and for an alert dialog", () => {
    const { trigger, selectors } = asking(dialog);
    dialogOf(trigger);
    expect(selectors).toHaveLength(1);
    expect(selectors[0]).toContain('[role="dialog"]');
    expect(selectors[0]).toContain('[role="alertdialog"]');
  });

  it("is null on a page, where Radix keeps measuring against the screen", () => {
    expect(dialogOf(asking(null).trigger)).toBeNull();
  });

  it("is null before the trigger is mounted", () => {
    expect(dialogOf(null)).toBeNull();
  });
});
