import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// docs/specs/qbo-invoice-12-event-type-services.md §4, §7.2: the Products/Services a connection's
// company can be sold as, for the picker on the Quote Types page.

const requireAdminOrAccountant = vi.fn(async () => "clerk_user");
vi.mock("@/features/userAccess/logic/requireAdminOrAccountant", () => ({
  requireAdminOrAccountant: (...args: unknown[]) => (requireAdminOrAccountant as any)(...args),
}));

const getQboAccessTokenAndRealmId = vi.fn(async (_connectionId: string) => ({
  accessToken: "tok",
  realmId: "123",
}));
vi.mock("@/features/quickbooks-integration/util", () => ({
  getBaseUrl: () => "https://qbo.example.com/v3/company",
  getQboAccessTokenAndRealmId: (...args: [string]) => getQboAccessTokenAndRealmId(...args),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

type RawItem = { Id: string; Name: string; FullyQualifiedName?: string; Type: string };

const request = (query = "?connectionId=conn-1") =>
  new NextRequest(`http://localhost:3000/api/quickbooks/items${query}`);

const item = (
  id: string,
  name: string,
  type = "Service",
  fullyQualifiedName?: string,
): RawItem => ({
  Id: id,
  Name: name,
  FullyQualifiedName: fullyQualifiedName ?? name,
  Type: type,
});

/** Answers each QuickBooks query with the next page of `pages`; records the queries it saw. */
let queries: string[] = [];
let pages: RawItem[][] = [];
let failWith: { status: number; body: unknown } | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminOrAccountant.mockImplementation(async () => "clerk_user");
  vi.spyOn(console, "error").mockImplementation(() => {});
  queries = [];
  pages = [];
  failWith = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      queries.push(new URL(url).searchParams.get("query")!);
      if (failWith) return new Response(JSON.stringify(failWith.body), { status: failWith.status });
      const page = pages[queries.length - 1] ?? [];
      return new Response(JSON.stringify({ QueryResponse: { Item: page } }));
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("GET /api/quickbooks/items", () => {
  it("is guarded for an admin or an accountant, and a refusal reads nothing", async () => {
    requireAdminOrAccountant.mockImplementation(async () => {
      throw new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    });

    const res = await GET(request());

    expect(res.status).toBe(403);
    expect(getQboAccessTokenAndRealmId).not.toHaveBeenCalled();
    expect(queries).toEqual([]);
  });

  it("answers 400 for a missing connectionId", async () => {
    const res = await GET(request(""));

    expect(res.status).toBe(400);
    expect(queries).toEqual([]);
  });

  it("asks the connection's company for its active Items, a thousand at a time", async () => {
    pages = [[item("1", "Rental")]];

    await GET(request("?connectionId=conn-9"));

    expect(getQboAccessTokenAndRealmId).toHaveBeenCalledWith("conn-9");
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain("from Item");
    expect(queries[0]).toContain("Active = true");
    expect(queries[0]).toContain("STARTPOSITION 1");
    expect(queries[0]).toContain("MAXRESULTS 1000");
  });

  it("keeps Service, NonInventory and Inventory Items and drops Category, Group and the rest", async () => {
    pages = [
      [
        item("1", "A service", "Service"),
        item("2", "A product", "NonInventory"),
        item("3", "Stock", "Inventory"),
        item("4", "A category", "Category"),
        item("5", "A bundle", "Group"),
        item("6", "Something else", "Other"),
      ],
    ];

    const res = await GET(request());

    expect(res.status).toBe(200);
    const { items } = await res.json();
    // Sorted by name: "A product", "A service", "Stock".
    expect(items.map((i: { id: string }) => i.id)).toEqual(["2", "1", "3"]);
  });

  it("answers the id, name, fully qualified name and type of each Item", async () => {
    pages = [[item("7", "Child", "Service", "Parent:Child")]];

    const { items } = await (await GET(request())).json();

    expect(items).toEqual([
      { id: "7", name: "Child", fullyQualifiedName: "Parent:Child", type: "Service" },
    ]);
  });

  it("sorts the list by fully qualified name", async () => {
    pages = [
      [
        item("1", "Zebra", "Service"),
        item("2", "Child", "Service", "Alpha:Child"),
        item("3", "Mid", "NonInventory"),
      ],
    ];

    const { items } = await (await GET(request())).json();

    expect(items.map((i: { fullyQualifiedName: string }) => i.fullyQualifiedName)).toEqual([
      "Alpha:Child",
      "Mid",
      "Zebra",
    ]);
  });

  it("follows a full first page with a second request from position 1001, and stops on a short page", async () => {
    pages = [
      Array.from({ length: 1000 }, (_, i) => item(String(i + 1), `Item ${i + 1}`)),
      [item("1001", "Last")],
    ];

    const { items } = await (await GET(request())).json();

    expect(queries).toHaveLength(2);
    expect(queries[1]).toContain("STARTPOSITION 1001");
    expect(items).toHaveLength(1001);
  });

  it("stops on an empty page after a full one", async () => {
    pages = [Array.from({ length: 1000 }, (_, i) => item(String(i + 1), `Item ${i + 1}`)), []];

    const { items } = await (await GET(request())).json();

    expect(queries).toHaveLength(2);
    expect(items).toHaveLength(1000);
  });

  it("passes a QuickBooks refusal on, with its status and message", async () => {
    failWith = {
      status: 401,
      body: { Fault: { Error: [{ Message: "AuthenticationFailed", Detail: "Token expired" }] } },
    };

    const res = await GET(request());

    expect(res.status).toBe(401);
    expect((await res.json()).error).toContain("Token expired");
  });

  it("answers 500 with the message when the token cannot be had", async () => {
    getQboAccessTokenAndRealmId.mockRejectedValueOnce(new Error("No QuickBooks token"));

    const res = await GET(request());

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("No QuickBooks token");
  });
});
