import { describe, it, expect } from "vitest";
import { mapBleacherTypeRow } from "./useBleacherTypes";

describe("mapBleacherTypeRow", () => {
  it("offers a bleacher type with its description", () => {
    expect(
      mapBleacherTypeRow({
        id: "bt-15",
        name: "15 Row",
        row_count: 15,
        description: "Seats 300.\n- guard rails",
      }),
    ).toEqual({
      id: "bt-15",
      name: "15 Row",
      rowCount: 15,
      description: "Seats 300.\n- guard rails",
    });
  });

  it("offers no description when the type has none", () => {
    expect(
      mapBleacherTypeRow({ id: "bt-7", name: null, row_count: null, description: null }),
    ).toEqual({ id: "bt-7", name: "", rowCount: 0, description: null });
  });
});
