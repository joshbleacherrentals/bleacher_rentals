import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  REPAIR_LAYER_CLASS,
  REPAIR_LAYER_Z,
  REPAIR_POPOVER_CLASS,
  REPAIR_POPOVER_Z,
} from "./repairLayer";
import { REPAIR_WINDOW_CLASS } from "../components/RepairWindow";

// The repair windows are opened from the Dashboard and from the card of a damage report, which are
// drawn above the default dialog layer (z-50): the cell editor is z-[1000], the card z-[1100] and the
// photo lightbox of the card z-[1200]. A window opened from them has to be over them, and the menus
// inside a window over the window. The dialogs are drawn in portals, which a server render cannot
// reach, so this pins the numbers and checks the source of every dialog of the feature.
// docs/specs/repairs-11-dashboard.md §11 (the browser check of 2026-11-23).

const CELL_EDITOR_Z = 1000;
const REPORT_CARD_Z = 1100;
const PHOTO_LIGHTBOX_Z = 1200;

const componentsDir = join(__dirname, "../components");
const read = (path: string) => readFileSync(path, "utf-8");

/**
 * The opening tags of a JSX element, from `<Name` to its closing `>`. A `>` inside braces (the arrow
 * of an `onSelect={(value) => ...}`) does not close the tag.
 */
function openingTags(source: string, name: string): string[] {
  const tags: string[] = [];
  const pattern = new RegExp(`<${name}\\b`, "g");
  for (const match of source.matchAll(pattern)) {
    let depth = 0;
    let end = match.index;
    for (; end < source.length; end += 1) {
      const ch = source[end];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}
const componentFiles = readdirSync(componentsDir).filter(
  (name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"),
);

describe("the layers of the repair windows", () => {
  it("puts the windows over the cell editor and the card of a report, and under the lightbox", () => {
    expect(REPAIR_LAYER_Z).toBeGreaterThan(CELL_EDITOR_Z);
    expect(REPAIR_LAYER_Z).toBeGreaterThan(REPORT_CARD_Z);
    expect(REPAIR_LAYER_Z).toBeLessThan(PHOTO_LIGHTBOX_Z);
  });

  it("puts the menus of a window over the window", () => {
    expect(REPAIR_POPOVER_Z).toBeGreaterThan(REPAIR_LAYER_Z);
  });

  it("writes the numbers as the Tailwind classes the dialogs use", () => {
    expect(REPAIR_LAYER_CLASS).toBe(`z-[${REPAIR_LAYER_Z}]`);
    expect(REPAIR_POPOVER_CLASS).toBe(`z-[${REPAIR_POPOVER_Z}]`);
  });

  it("is in the class of the repair window and of the service window", () => {
    expect(REPAIR_WINDOW_CLASS).toContain(REPAIR_LAYER_CLASS);
    const service = read(join(componentsDir, "ServiceWindow.tsx"));
    expect(service).toMatch(/const SERVICE_WINDOW_CLASS =[^;]*REPAIR_LAYER_CLASS/);
  });

  it("is on the content and the overlay of every dialog of the feature", () => {
    let tags = 0;
    for (const name of componentFiles) {
      const source = read(join(componentsDir, name));
      for (const tag of [
        ...openingTags(source, "DialogContent"),
        ...openingTags(source, "AlertDialogContent"),
      ]) {
        tags += 1;
        const where = `${name}: ${tag.replace(/\s+/g, " ")}`;
        expect(tag, where).toContain("overlayClassName={REPAIR_LAYER_CLASS}");
        // The content takes the layer from its own class or from the class of its window.
        expect(tag, where).toMatch(/REPAIR_LAYER_CLASS|REPAIR_WINDOW_CLASS|SERVICE_WINDOW_CLASS/);
      }
    }
    // Four windows and their five confirmation dialogs, the damage report window and the dialog that
    // asks which damage reports to close (spec 08a): eleven in all.
    expect(tags).toBe(11);
  });

  it("is on every menu that opens inside a window", () => {
    for (const name of ["RepairForm.tsx", "ServiceForm.tsx"]) {
      const source = read(join(componentsDir, name));
      const selects = openingTags(source, "SearchableSelect");
      expect(selects.length, name).toBeGreaterThan(0);
      for (const select of selects) {
        expect(select, name).toContain("popoverClassName={REPAIR_POPOVER_CLASS}");
      }
    }
    const status = read(join(componentsDir, "RepairStatusMenu.tsx"));
    expect(status).toMatch(/<DropdownMenuContent[^>]*REPAIR_POPOVER_CLASS/);
  });

  it("is a prop of the shared dialogs and of the searchable select", () => {
    const ui = join(__dirname, "../../../components");
    expect(read(join(ui, "ui/dialog.tsx"))).toContain("overlayClassName");
    expect(read(join(ui, "ui/alert-dialog.tsx"))).toContain("overlayClassName");
    expect(read(join(ui, "SearchableSelect.tsx"))).toContain("popoverClassName");
  });
});
