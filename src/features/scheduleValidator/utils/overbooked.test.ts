import { describe, it, expect } from "vitest";
import { findOverbookedBleachers, type BleacherBooking } from "./overbooked";

const WEEK = "2026-11-09"; // Monday; the week ends Sunday 2026-11-15

let n = 0;
const booking = (
  bleacher: string,
  event: string,
  startDate: string,
  endDate: string,
  overrides: Partial<BleacherBooking> = {},
): BleacherBooking => ({
  bleacherUuid: bleacher,
  bleacherNumber: Number(bleacher.replace(/\D/g, "")) || ++n,
  bleacherTypeName: "7 Row",
  eventId: event,
  eventName: `Event ${event}`,
  startDate,
  endDate,
  ...overrides,
});

describe("findOverbookedBleachers", () => {
  it("finds a bleacher whose two events share a day, and says which days", () => {
    const rows = [
      booking("b1", "A", "2026-11-09", "2026-11-12"),
      booking("b1", "B", "2026-11-11", "2026-11-14"),
    ];
    const [bleacher] = findOverbookedBleachers(rows, WEEK);
    expect(bleacher.bleacherUuid).toBe("b1");
    expect(bleacher.conflicts).toHaveLength(1);
    const [c] = bleacher.conflicts;
    expect([c.first.eventId, c.second.eventId]).toEqual(["A", "B"]);
    expect([c.overlapStart, c.overlapEnd]).toEqual(["2026-11-11", "2026-11-12"]);
  });

  it("does not flag events one after the other, even on consecutive days", () => {
    const rows = [
      booking("b1", "A", "2026-11-09", "2026-11-10"),
      booking("b1", "B", "2026-11-11", "2026-11-12"),
    ];
    expect(findOverbookedBleachers(rows, WEEK)).toEqual([]);
  });

  it("flags events that touch on a single shared day", () => {
    const rows = [
      booking("b1", "A", "2026-11-09", "2026-11-10"),
      booking("b1", "B", "2026-11-10", "2026-11-12"),
    ];
    const [bleacher] = findOverbookedBleachers(rows, WEEK);
    expect([bleacher.conflicts[0].overlapStart, bleacher.conflicts[0].overlapEnd]).toEqual([
      "2026-11-10",
      "2026-11-10",
    ]);
  });

  it("does not flag two different bleachers on the same days", () => {
    const rows = [
      booking("b1", "A", "2026-11-09", "2026-11-12"),
      booking("b2", "B", "2026-11-09", "2026-11-12"),
    ];
    expect(findOverbookedBleachers(rows, WEEK)).toEqual([]);
  });

  it("counts an event once even when the bleacher is linked to it twice", () => {
    const rows = [
      booking("b1", "A", "2026-11-09", "2026-11-12"),
      booking("b1", "A", "2026-11-09", "2026-11-12"),
    ];
    expect(findOverbookedBleachers(rows, WEEK)).toEqual([]);
  });

  it("only reports an overlap that touches the selected week", () => {
    const before = [
      booking("b1", "A", "2026-11-01", "2026-11-05"),
      booking("b1", "B", "2026-11-04", "2026-11-08"),
    ];
    const after = [
      booking("b2", "A", "2026-11-16", "2026-11-18"),
      booking("b2", "B", "2026-11-17", "2026-11-20"),
    ];
    expect(findOverbookedBleachers([...before, ...after], WEEK)).toEqual([]);
  });

  it("reports an overlap that runs into the week from an event that started before it", () => {
    const rows = [
      booking("b1", "A", "2026-11-05", "2026-11-09"),
      booking("b1", "B", "2026-11-09", "2026-11-20"),
    ];
    expect(findOverbookedBleachers(rows, WEEK)).toHaveLength(1);
  });

  it("lists every clashing pair when three events collide, once per pair", () => {
    const rows = [
      booking("b1", "A", "2026-11-09", "2026-11-15"),
      booking("b1", "B", "2026-11-10", "2026-11-11"),
      booking("b1", "C", "2026-11-11", "2026-11-12"),
    ];
    const [bleacher] = findOverbookedBleachers(rows, WEEK);
    const pairs = bleacher.conflicts.map((c) => `${c.first.eventId}${c.second.eventId}`);
    expect(pairs.sort()).toEqual(["AB", "AC", "BC"]);
  });

  it("orders the bleachers by number", () => {
    const clash = (id: string, number: number) => [
      booking(id, "A", "2026-11-09", "2026-11-12", { bleacherNumber: number }),
      booking(id, "B", "2026-11-10", "2026-11-12", { bleacherNumber: number }),
    ];
    const result = findOverbookedBleachers([...clash("x", 30), ...clash("y", 4)], WEEK);
    expect(result.map((b) => b.bleacherNumber)).toEqual([4, 30]);
  });
});
