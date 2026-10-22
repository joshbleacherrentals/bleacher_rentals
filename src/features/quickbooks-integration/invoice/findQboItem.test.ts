import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
      const name = /Name = '((?:[^'\\]|\\.)*)'/.exec(query)![1].replace(/\\(.)/g, "$1");
      const found = items.filter((i) => i.Name === name && i.Active);
      return new Response(JSON.stringify({ QueryResponse: { Item: found } }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("findQboItem", () => {
  it("returns the active Item named after the event type", async () => {
    items = [{ Id: "77", Name: "Bleacher Rental - Corporate", Description: "Seats", Active: true }];
    expect(await findQboItem("conn-1", "Corporate")).toEqual({
      id: "77",
      name: "Bleacher Rental - Corporate",
      description: "Seats",
    });
    expect(queries[0]).toContain("from Item");
    expect(queries[0]).toContain("Active = true");
  });

  it("an Item with no Description has description null", async () => {
    items = [{ Id: "77", Name: "Bleacher Rental - City", Active: true }];
    expect((await findQboItem("conn-1", "City")).description).toBeNull();
  });

  it("no Item: an error that names the wanted Item", async () => {
    await expect(findQboItem("conn-1", "Rural")).rejects.toThrow(
      'QuickBooks has no active Item named "Bleacher Rental - Rural" in this company',
    );
  });

  it("an inactive Item is not found", async () => {
    items = [{ Id: "77", Name: "Bleacher Rental - Rural", Active: false }];
    await expect(findQboItem("conn-1", "Rural")).rejects.toThrow(/no active Item/);
  });

  it("two Items: an error that says more than one", async () => {
    items = [
      { Id: "1", Name: "Bleacher Rental - City", Active: true },
      { Id: "2", Name: "Bleacher Rental - City", Active: true },
    ];
    await expect(findQboItem("conn-1", "City")).rejects.toThrow(/more than one/);
  });

  it("escapes an apostrophe in the name", async () => {
    items = [{ Id: "9", Name: "Bleacher Rental - O'Brien", Active: true }];
    const item = await findQboItem("conn-1", "O'Brien");
    expect(item.id).toBe("9");
    expect(queries[0]).toContain("Name = 'Bleacher Rental - O\\'Brien'");
  });

  it("a QuickBooks failure is reported, not read as no Item", async () => {
    failWith = { status: 400, body: { Fault: { Error: [{ Message: "Bad", Detail: "boom" }] } } };
    await expect(findQboItem("conn-1", "City")).rejects.toThrow(/Item search failed: boom/);
  });
});
