import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchProvinceTaxCodes, setProvinceTaxCodeApi } from "./api";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §4: the page reaches db.ts through the
// province-tax-codes route; these two functions are its only callers.

const fakeFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fakeFetch);
  fakeFetch.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchProvinceTaxCodes", () => {
  it("GETs the route with the connection id and returns the rows", async () => {
    fakeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ provinceTaxCodes: [{ province: "ON", qbo_tax_code_id: "5" }] }),
      ),
    );

    const rows = await fetchProvinceTaxCodes("conn 1");

    expect(fakeFetch).toHaveBeenCalledWith(
      "/api/quickbooks/province-tax-codes?connectionId=conn%201",
    );
    expect(rows).toEqual([{ province: "ON", qbo_tax_code_id: "5" }]);
  });

  it("throws the route's message on a failure", async () => {
    fakeFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );

    await expect(fetchProvinceTaxCodes("conn-1")).rejects.toThrow("Forbidden");
  });
});

describe("setProvinceTaxCodeApi", () => {
  it("PUTs the connection, province and tax code id", async () => {
    fakeFetch.mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await setProvinceTaxCodeApi("conn-1", "ON", "5");

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe("/api/quickbooks/province-tax-codes");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({
      connectionId: "conn-1",
      province: "ON",
      taxCodeId: "5",
    });
  });

  it("sends null to remove the code", async () => {
    fakeFetch.mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await setProvinceTaxCodeApi("conn-1", "ON", null);

    expect(JSON.parse(fakeFetch.mock.calls[0][1].body).taxCodeId).toBeNull();
  });

  it("throws the route's message on a failure", async () => {
    fakeFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );

    await expect(setProvinceTaxCodeApi("conn-1", "ON", "5")).rejects.toThrow("Forbidden");
  });
});
