import { describe, it, expect } from "vitest";
import {
  AMOUNT_TYPES,
  DEFAULT_LIST_STATE,
  collectionsListStateToParams,
  nextAmountType,
  nextSortState,
  parseCollectionsListState,
  type CollectionsAmountType,
  type CollectionsListState,
  type CollectionsSortKey,
} from "./collectionsListState";

const read = (query: string) => parseCollectionsListState(new URLSearchParams(query));

describe("DEFAULT_LIST_STATE", () => {
  it("is Next Follow Up, oldest first, with Show Not Due Yet off, on the Collections type", () => {
    expect(DEFAULT_LIST_STATE).toEqual({
      sort: "followUp",
      dir: "asc",
      showNotDue: false,
      type: "collections",
    });
  });
});

// docs/specs/accountant-collections-23-amount-type-switch.md §3: the click order.
describe("AMOUNT_TYPES and nextAmountType", () => {
  it("lists the types in click order", () => {
    expect(AMOUNT_TYPES).toEqual(["collections", "deposits", "all"]);
  });

  it("steps Collections, Deposits, All, and then Collections again", () => {
    expect(nextAmountType("collections")).toBe("deposits");
    expect(nextAmountType("deposits")).toBe("all");
    expect(nextAmountType("all")).toBe("collections");
  });

  it("cycles through all three and comes back", () => {
    let type: CollectionsAmountType = "collections";
    const seen: CollectionsAmountType[] = [];
    for (let i = 0; i < 6; i++) {
      type = nextAmountType(type);
      seen.push(type);
    }
    expect(seen).toEqual(["deposits", "all", "collections", "deposits", "all", "collections"]);
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
      type: "collections",
    });
    expect(read("csort=overdue&cdir=asc")).toEqual({
      sort: "overdue",
      dir: "asc",
      showNotDue: false,
      type: "collections",
    });
    expect(read("csort=follow&cdir=desc").sort).toBe("followUp");
    expect(read("csort=amount&cdir=desc&cnotdue=1&type=deposits")).toEqual({
      sort: "amount",
      dir: "desc",
      showNotDue: true,
      type: "deposits",
    });
  });

  // docs/specs/accountant-collections-23-amount-type-switch.md §1 and §7.
  it("reads type: missing is Collections, deposits and all are themselves", () => {
    expect(read("").type).toBe("collections");
    expect(read("type=collections").type).toBe("collections");
    expect(read("type=deposits").type).toBe("deposits");
    expect(read("type=all").type).toBe("all");
  });

  it("reads an unknown, empty or differently cased type as Collections", () => {
    expect(read("type=bogus").type).toBe("collections");
    expect(read("type=").type).toBe("collections");
    expect(read("type=Deposits").type).toBe("collections");
    expect(read("type=ALL").type).toBe("collections");
    expect(read("type=full").type).toBe("collections");
  });

  it("falls back to the default for an unknown or missing value, one parameter at a time", () => {
    expect(read("csort=bogus&cdir=desc")).toEqual({ ...DEFAULT_LIST_STATE, dir: "desc" });
    expect(read("csort=amount&cdir=sideways")).toEqual({ ...DEFAULT_LIST_STATE, sort: "amount" });
    expect(read("cnotdue=0").showNotDue).toBe(false);
    expect(read("cnotdue=yes").showNotDue).toBe(false);
    expect(read("csort=&cdir=&cnotdue=&type=")).toEqual(DEFAULT_LIST_STATE);
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
    expect(collectionsListStateToParams({ ...DEFAULT_LIST_STATE, sort: "amount" })).toEqual({
      csort: "amount",
    });
    expect(collectionsListStateToParams({ ...DEFAULT_LIST_STATE, dir: "desc" })).toEqual({
      cdir: "desc",
    });
    expect(collectionsListStateToParams({ ...DEFAULT_LIST_STATE, showNotDue: true })).toEqual({
      cnotdue: "1",
    });
    expect(
      collectionsListStateToParams({
        sort: "overdue",
        dir: "desc",
        showNotDue: true,
        type: "collections",
      }),
    ).toEqual({ csort: "overdue", cdir: "desc", cnotdue: "1" });
  });

  // docs/specs/accountant-collections-23-amount-type-switch.md §1 (D3).
  it("writes type for Deposits and All, and leaves it out for Collections", () => {
    expect(collectionsListStateToParams({ ...DEFAULT_LIST_STATE, type: "deposits" })).toEqual({
      type: "deposits",
    });
    expect(collectionsListStateToParams({ ...DEFAULT_LIST_STATE, type: "all" })).toEqual({
      type: "all",
    });
    expect(collectionsListStateToParams({ ...DEFAULT_LIST_STATE, type: "collections" })).toEqual(
      {},
    );
    expect(
      collectionsListStateToParams({
        sort: "overdue",
        dir: "desc",
        showNotDue: true,
        type: "deposits",
      }),
    ).toEqual({ csort: "overdue", cdir: "desc", cnotdue: "1", type: "deposits" });
  });

  it("names the sort columns follow, overdue and amount", () => {
    const names = (["followUp", "overdue", "amount"] as const).map(
      (sort) => collectionsListStateToParams({ ...DEFAULT_LIST_STATE, sort, dir: "desc" }).csort,
    );
    expect(names).toEqual([undefined, "overdue", "amount"]);
    expect(
      collectionsListStateToParams({ ...DEFAULT_LIST_STATE, sort: "followUp", dir: "desc" }),
    ).not.toHaveProperty("csort");
  });

  it("round-trips all thirty-six states", () => {
    const keys: CollectionsSortKey[] = ["followUp", "overdue", "amount"];
    for (const sort of keys) {
      for (const dir of ["asc", "desc"] as const) {
        for (const showNotDue of [false, true]) {
          for (const type of AMOUNT_TYPES) {
            const state: CollectionsListState = { sort, dir, showNotDue, type };
            const params = new URLSearchParams(collectionsListStateToParams(state));
            expect(parseCollectionsListState(params)).toEqual(state);
          }
        }
      }
    }
  });
});

describe("nextSortState", () => {
  it("flips the direction when the same column is clicked", () => {
    const asc: CollectionsListState = DEFAULT_LIST_STATE;
    expect(nextSortState(asc, "followUp")).toEqual({ ...asc, dir: "desc" });
    expect(nextSortState({ ...asc, dir: "desc" }, "followUp")).toEqual(asc);
  });

  it("sorts another column descending, whatever the direction was", () => {
    const start: CollectionsListState = {
      sort: "followUp",
      dir: "asc",
      showNotDue: true,
      type: "deposits",
    };
    expect(nextSortState(start, "amount")).toEqual({
      sort: "amount",
      dir: "desc",
      showNotDue: true,
      type: "deposits",
    });
    expect(nextSortState({ ...start, sort: "amount", dir: "asc" }, "overdue")).toEqual({
      sort: "overdue",
      dir: "desc",
      showNotDue: true,
      type: "deposits",
    });
  });
});
