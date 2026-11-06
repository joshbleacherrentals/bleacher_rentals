import { describe, it, expect } from "vitest";
import {
  DEFAULT_LIST_STATE,
  collectionsListStateToParams,
  nextSortState,
  parseCollectionsListState,
  type CollectionsListState,
  type CollectionsSortKey,
} from "./collectionsListState";

const read = (query: string) => parseCollectionsListState(new URLSearchParams(query));

describe("DEFAULT_LIST_STATE", () => {
  it("is Next Follow Up, oldest first, with Show Not Due Yet off", () => {
    expect(DEFAULT_LIST_STATE).toEqual({ sort: "followUp", dir: "asc", showNotDue: false });
  });
});

describe("parseCollectionsListState", () => {
  it("reads the defaults from an empty URL", () => {
    expect(read("")).toEqual(DEFAULT_LIST_STATE);
  });

  it("reads every parameter", () => {
    expect(read("csort=amount&cdir=desc&cnotdue=1")).toEqual({
      sort: "amount",
      dir: "desc",
      showNotDue: true,
    });
    expect(read("csort=overdue&cdir=asc")).toEqual({
      sort: "overdue",
      dir: "asc",
      showNotDue: false,
    });
    expect(read("csort=follow&cdir=desc").sort).toBe("followUp");
  });

  it("falls back to the default for an unknown or missing value, one parameter at a time", () => {
    expect(read("csort=bogus&cdir=desc")).toEqual({ ...DEFAULT_LIST_STATE, dir: "desc" });
    expect(read("csort=amount&cdir=sideways")).toEqual({ ...DEFAULT_LIST_STATE, sort: "amount" });
    expect(read("cnotdue=0").showNotDue).toBe(false);
    expect(read("cnotdue=yes").showNotDue).toBe(false);
    expect(read("csort=&cdir=&cnotdue=")).toEqual(DEFAULT_LIST_STATE);
  });

  it("ignores the parameters other code owns", () => {
    expect(read("tab=collections&sort=start_date&page=3&q=acme")).toEqual(DEFAULT_LIST_STATE);
  });
});

describe("collectionsListStateToParams", () => {
  it("writes nothing for the default state", () => {
    expect(collectionsListStateToParams(DEFAULT_LIST_STATE)).toEqual({});
  });

  it("omits whatever equals its default and writes the rest", () => {
    expect(collectionsListStateToParams({ sort: "amount", dir: "asc", showNotDue: false })).toEqual(
      { csort: "amount" },
    );
    expect(
      collectionsListStateToParams({ sort: "followUp", dir: "desc", showNotDue: false }),
    ).toEqual({ cdir: "desc" });
    expect(
      collectionsListStateToParams({ sort: "followUp", dir: "asc", showNotDue: true }),
    ).toEqual({ cnotdue: "1" });
    expect(
      collectionsListStateToParams({ sort: "overdue", dir: "desc", showNotDue: true }),
    ).toEqual({ csort: "overdue", cdir: "desc", cnotdue: "1" });
  });

  it("names the sort columns follow, overdue and amount", () => {
    const names = (["followUp", "overdue", "amount"] as const).map(
      (sort) => collectionsListStateToParams({ sort, dir: "desc", showNotDue: false }).csort,
    );
    expect(names).toEqual([undefined, "overdue", "amount"]);
    expect(
      collectionsListStateToParams({ sort: "followUp", dir: "desc", showNotDue: false }),
    ).not.toHaveProperty("csort");
  });

  it("round-trips all twelve states", () => {
    const keys: CollectionsSortKey[] = ["followUp", "overdue", "amount"];
    for (const sort of keys) {
      for (const dir of ["asc", "desc"] as const) {
        for (const showNotDue of [false, true]) {
          const state: CollectionsListState = { sort, dir, showNotDue };
          const params = new URLSearchParams(collectionsListStateToParams(state));
          expect(parseCollectionsListState(params)).toEqual(state);
        }
      }
    }
  });
});

describe("nextSortState", () => {
  it("flips the direction when the same column is clicked", () => {
    const asc: CollectionsListState = { sort: "followUp", dir: "asc", showNotDue: false };
    expect(nextSortState(asc, "followUp")).toEqual({ ...asc, dir: "desc" });
    expect(nextSortState({ ...asc, dir: "desc" }, "followUp")).toEqual(asc);
  });

  it("sorts another column descending, whatever the direction was", () => {
    const start: CollectionsListState = { sort: "followUp", dir: "asc", showNotDue: true };
    expect(nextSortState(start, "amount")).toEqual({
      sort: "amount",
      dir: "desc",
      showNotDue: true,
    });
    expect(nextSortState({ ...start, sort: "amount", dir: "asc" }, "overdue")).toEqual({
      sort: "overdue",
      dir: "desc",
      showNotDue: true,
    });
  });
});
