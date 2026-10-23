import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchProvinceTaxCodes,
  isCanadianConnection,
  setProvinceTaxCodeApi,
  setQboConnectionNoTaxCodeApi,
} from "./api";

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

// docs/specs/qbo-invoice-03e-canadian-settings-cad-only.md §3 and §6: the province section and the
// no-tax row are drawn for a connection whose recorded currency is exactly CAD.
describe("isCanadianConnection", () => {
  it("is true for CAD", () => {
    expect(isCanadianConnection("CAD")).toBe(true);
  });

  it.each([["USD"], [null], [undefined], [""], ["cad"], [" CAD"], ["EUR"]])(
    "is false for %j",
    (currency) => {
      expect(isCanadianConnection(currency as string | null | undefined)).toBe(false);
    },
  );
});

// docs/specs/qbo-invoice-03c-no-tax-code.md §4: the "no tax" code is saved through the connections
// route, as the Default Tax Code is.
describe("setQboConnectionNoTaxCodeApi", () => {
  it("PATCHes the connections route with the connection and the code", async () => {
    fakeFetch.mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await setQboConnectionNoTaxCodeApi("conn-1", "2");

    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const [url, init] = fakeFetch.mock.calls[0];
    expect(url).toBe("/api/quickbooks/connections");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ connectionId: "conn-1", noTaxCodeId: "2" });
  });

  it("sends null to clear the code", async () => {
    fakeFetch.mockResolvedValue(new Response(JSON.stringify({ success: true })));

    await setQboConnectionNoTaxCodeApi("conn-1", null);

    expect(JSON.parse(fakeFetch.mock.calls[0][1].body).noTaxCodeId).toBeNull();
  });

  it("throws the route's message on a failure", async () => {
    fakeFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }),
    );

    await expect(setQboConnectionNoTaxCodeApi("conn-1", "2")).rejects.toThrow("Forbidden");
  });
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
