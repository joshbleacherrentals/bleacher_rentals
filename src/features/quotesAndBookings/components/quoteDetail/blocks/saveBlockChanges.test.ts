import { describe, expect, it } from "vitest";
import { changedColumns } from "./saveBlockChanges";

describe("changedColumns", () => {
  it("returns only the columns whose value changed", () => {
    expect(changedColumns({ a: "x", b: 1 }, { a: "x", b: 2 })).toEqual({ b: 2 });
  });

  it("returns nothing when nothing changed", () => {
    expect(changedColumns({ a: "x", b: null }, { a: "x", b: null })).toEqual({});
  });

  it("treats null and undefined as the same", () => {
    expect(changedColumns({ a: null }, { a: undefined })).toEqual({});
  });

  it("returns a column cleared to null", () => {
    expect(changedColumns({ a: "x" }, { a: null })).toEqual({ a: null });
  });
});
