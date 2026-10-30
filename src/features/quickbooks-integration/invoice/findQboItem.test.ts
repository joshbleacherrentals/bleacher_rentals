import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-12b-use-the-mapping.md §4, §7: the Item is the one assigned to the event
// type on the Quote Types page, found by its id.

vi.mock("../util", () => ({
  getBaseUrl: () => "https://qbo.example.com/v3/company",
  getQboAccessTokenAndRealmId: vi.fn(async () => ({ accessToken: "tok", realmId: "123" })),
}));

import { findQboItem } from "./findQboItem";

let items: Array<{ Id: string; Name: string; Description?: string; Active: boolean }> = [];
let queries: string[] = [];
let failWith: { status: number; body: unknown } | null = null;

beforeEach(() => {
  items = [];
  queries = [];
  failWith = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const query = new URL(url).searchParams.get("query")!;
      queries.push(query);
      if (failWith) return new Response(JSON.stringify(failWith.body), { status: failWith.status });
      const id = /Id = '((?:[^'\\]|\\.)*)'/.exec(query)![1].replace(/\\(.)/g, "$1");
      const found = items.filter((i) => i.Id === id && i.Active);
      return new Response(JSON.stringify({ QueryResponse: { Item: found } }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("findQboItem", () => {
  it("returns the active Item with the assigned id", async () => {
    items = [{ Id: "77", Name: "Corporate rental", Description: "Seats", Active: true }];
    expect(await findQboItem("conn-1", "77")).toEqual({
      id: "77",
      name: "Corporate rental",
      description: "Seats",
    });
  });

  it("asks for the Item by its Id, active only", async () => {
    items = [{ Id: "77", Name: "Corporate rental", Active: true }];

    await findQboItem("conn-1", "77");

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("from Item");
    expect(queries[0]).toContain("Id = '77'");
    expect(queries[0]).toContain("Active = true");
  });

  it("never asks for an Item by a name built from the event type", async () => {
    items = [{ Id: "77", Name: "Corporate rental", Active: true }];

    await findQboItem("conn-1", "77");

    expect(queries[0]).not.toContain("Bleacher Rental");
    expect(queries[0]).not.toContain("Name =");
  });

  it("an Item with no Description has description null", async () => {
    items = [{ Id: "77", Name: "Corporate rental", Active: true }];
    expect((await findQboItem("conn-1", "77")).description).toBeNull();
  });

  it("an Item with a blank Description has description null", async () => {
    items = [{ Id: "77", Name: "Corporate rental", Description: "   ", Active: true }];
    expect((await findQboItem("conn-1", "77")).description).toBeNull();
  });

  it("no Item: an error that names the id and the Quote Types page", async () => {
    await expect(findQboItem("conn-1", "404")).rejects.toThrow(
      "The QuickBooks Product/Service assigned to this quote type (id 404) is not an active Item in this company. Assign another on the Quote Types page.",
    );
  });

  it("an inactive Item is not found", async () => {
    items = [{ Id: "77", Name: "Corporate rental", Active: false }];
    await expect(findQboItem("conn-1", "77")).rejects.toThrow(/not an active Item/);
  });

  it("escapes an apostrophe in the id", async () => {
    items = [{ Id: "9'x", Name: "Odd", Active: true }];
    const item = await findQboItem("conn-1", "9'x");
    expect(item.id).toBe("9'x");
    expect(queries[0]).toContain("Id = '9\\'x'");
  });

  it("a QuickBooks failure is reported, not read as no Item", async () => {
    failWith = { status: 400, body: { Fault: { Error: [{ Message: "Bad", Detail: "boom" }] } } };
    await expect(findQboItem("conn-1", "77")).rejects.toThrow(/Item search failed: boom/);
  });
});
