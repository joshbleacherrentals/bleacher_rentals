import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { BleacherSwapPanel } from "./BleacherSwapPanel";

const bleacherOptions = [
  { uuid: "b-1", label: "#101 (7 row)" },
  { uuid: "b-2", label: "#202 (10 row)" },
];

function render(assigned: string | null, actual: string | null, reason: string | null = null) {
  return renderToString(
    <BleacherSwapPanel
      assignedBleacherUuid={assigned}
      actualBleacherUuid={actual}
      reasonCode={reason}
      bleacherOptions={bleacherOptions}
      canEdit
      labelClassName=""
      onChange={() => {}}
    />,
  );
}

describe("BleacherSwapPanel", () => {
  it("raises an alert naming both bleachers when the driver took a different one", () => {
    const html = render("b-1", "b-2");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Action Needed");
    expect(html).toContain("#202 (10 row)");
    expect(html).toContain("#101 (7 row)");
  });

  it("shows the reason as plain text, in full, not as a dropdown", () => {
    const html = render("b-1", "b-2", "blocked_by_other_units");
    expect(html).toContain("Blocked by other bleachers");
    expect(html).not.toContain("bleacher-change-reason-select");
  });

  it("says when a swap has no reason, and 'No change' when there is no swap", () => {
    expect(render("b-1", "b-2")).toContain("No reason given");
    expect(render("b-1", "b-1")).toContain("No change");
  });

  it("raises no alert when the driver took the assigned bleacher", () => {
    const html = render("b-1", "b-1");
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("Actual Bleacher");
  });

  it("renders nothing until the driver has confirmed", () => {
    expect(render("b-1", null)).toBe("");
  });
});
