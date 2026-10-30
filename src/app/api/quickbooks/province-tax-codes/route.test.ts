import { describe, it, expect, vi, beforeEach } from "vitest";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §4: the mapping is read and written by an admin
// only, like the rest of the /quickbooks page.

const requireAdmin = vi.fn(async () => "clerk_admin");
vi.mock("@/features/userAccess/logic/requireAdmin", () => ({
  requireAdmin: (...args: unknown[]) => (requireAdmin as any)(...args),
}));

const getProvinceTaxCodes = vi.fn(async (_connectionId: string) => [
  { province: "ON", qbo_tax_code_id: "5" },
]);
const setProvinceTaxCode = vi.fn(
  async (_connectionId: string, _province: string, _taxCodeId: string | null) => undefined,
);
vi.mock("@/features/quickbooks-integration/db", () => ({
  getProvinceTaxCodes: (...args: [string]) => getProvinceTaxCodes(...args),
  setProvinceTaxCode: (...args: [string, string, string | null]) => setProvinceTaxCode(...args),
}));

import { GET, PUT } from "./route";
import { NextRequest } from "next/server";

const forbidden = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });

const getRequest = (query = "?connectionId=c1") =>
  new NextRequest(`http://localhost:3000/api/quickbooks/province-tax-codes${query}`);

const putRequest = (body: unknown) =>
  new NextRequest("http://localhost:3000/api/quickbooks/province-tax-codes", {
    method: "PUT",
    body: JSON.stringify(body),
  });

describe("/api/quickbooks/province-tax-codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockImplementation(async () => "clerk_admin");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("GET", () => {
    it("is guarded for an admin and returns the connection's rows", async () => {
      const res = await GET(getRequest());

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        provinceTaxCodes: [{ province: "ON", qbo_tax_code_id: "5" }],
      });
      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(getProvinceTaxCodes).toHaveBeenCalledWith("c1");
    });

    it("answers 403 for anyone else and reads nothing", async () => {
      requireAdmin.mockImplementation(async () => {
        throw forbidden();
      });

      const res = await GET(getRequest());

      expect(res.status).toBe(403);
      expect(getProvinceTaxCodes).not.toHaveBeenCalled();
    });

    it("answers 400 without a connectionId", async () => {
      const res = await GET(getRequest(""));

      expect(res.status).toBe(400);
      expect(getProvinceTaxCodes).not.toHaveBeenCalled();
    });

    it("answers 500 with the message when the read fails", async () => {
      getProvinceTaxCodes.mockRejectedValueOnce(new Error("db down"));

      const res = await GET(getRequest());

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("db down");
    });
  });

  describe("PUT", () => {
    it("is guarded for an admin and saves the province's tax code", async () => {
      const res = await PUT(putRequest({ connectionId: "c1", province: "ON", taxCodeId: "5" }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(setProvinceTaxCode).toHaveBeenCalledWith("c1", "ON", "5");
    });

    it("passes a null id on, which removes the code", async () => {
      const res = await PUT(putRequest({ connectionId: "c1", province: "QC", taxCodeId: null }));

      expect(res.status).toBe(200);
      expect(setProvinceTaxCode).toHaveBeenCalledWith("c1", "QC", null);
    });

    it("answers 403 for anyone else and writes nothing", async () => {
      requireAdmin.mockImplementation(async () => {
        throw forbidden();
      });

      const res = await PUT(putRequest({ connectionId: "c1", province: "ON", taxCodeId: "5" }));

      expect(res.status).toBe(403);
      expect(setProvinceTaxCode).not.toHaveBeenCalled();
    });

    it("answers 400 without a connectionId", async () => {
      const res = await PUT(putRequest({ province: "ON", taxCodeId: "5" }));

      expect(res.status).toBe(400);
      expect(setProvinceTaxCode).not.toHaveBeenCalled();
    });

    it.each([["XX"], ["on"], ["Ontario"], [""], [undefined]])(
      "answers 400 for the province %j, which is not one of the 13 codes",
      async (province) => {
        const res = await PUT(putRequest({ connectionId: "c1", province, taxCodeId: "5" }));

        expect(res.status).toBe(400);
        expect(setProvinceTaxCode).not.toHaveBeenCalled();
      },
    );

    // A body that forgot taxCodeId must not be read as "remove the code".
    it.each([[undefined], [""], [5]])(
      "answers 400 for the tax code id %j, which is neither an id nor null",
      async (taxCodeId) => {
        const res = await PUT(putRequest({ connectionId: "c1", province: "ON", taxCodeId }));

        expect(res.status).toBe(400);
        expect(setProvinceTaxCode).not.toHaveBeenCalled();
      },
    );

    it("answers 500 with the message when the write fails", async () => {
      setProvinceTaxCode.mockRejectedValueOnce(new Error("denied"));

      const res = await PUT(putRequest({ connectionId: "c1", province: "ON", taxCodeId: "5" }));

      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe("denied");
    });
  });
});
