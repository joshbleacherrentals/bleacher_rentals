import { describe, it, expect, vi, beforeEach } from "vitest";

// docs/specs/accountant-team.md §5: an accountant may READ the list of QuickBooks connections (the
// vendor modal needs it); creating, renaming, retargeting and deleting one stays admin-only.

const requireAdmin = vi.fn(async () => "clerk_admin");
const requireAdminOrAccountant = vi.fn(async () => "clerk_user");

vi.mock("@/features/userAccess/logic/requireAdmin", () => ({
  requireAdmin: (...args: unknown[]) => (requireAdmin as any)(...args),
}));
vi.mock("@/features/userAccess/logic/requireAdminOrAccountant", () => ({
  requireAdminOrAccountant: (...args: unknown[]) => (requireAdminOrAccountant as any)(...args),
}));

const getAllQboConnections = vi.fn(async () => [
  {
    id: "c1",
    display_name: "Main",
    realm_id: "r1",
    qbo_tax_code_id: null,
    qbo_no_tax_code_id: null,
    currency: "CAD",
  },
]);
const updateQboConnectionTaxCode = vi.fn(async (_id: string, _code: string | null) => undefined);
const updateQboConnectionNoTaxCode = vi.fn(async (_id: string, _code: string | null) => undefined);
vi.mock("@/features/quickbooks-integration/db", () => ({
  getAllQboConnections: (...args: unknown[]) => (getAllQboConnections as any)(...args),
  createQboConnectionPlaceholder: vi.fn(async () => "new-id"),
  deleteQboConnection: vi.fn(async () => undefined),
  updateQboConnectionDisplayName: vi.fn(async () => undefined),
  updateQboConnectionTaxCode: (...args: [string, string | null]) =>
    updateQboConnectionTaxCode(...args),
  updateQboConnectionNoTaxCode: (...args: [string, string | null]) =>
    updateQboConnectionNoTaxCode(...args),
}));

import { GET, POST, PATCH, DELETE } from "./route";
import { NextRequest } from "next/server";

const forbidden = () =>
  new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });

const jsonRequest = (method: string, body: unknown) =>
  new NextRequest("http://localhost:3000/api/quickbooks/connections", {
    method,
    body: JSON.stringify(body),
  });

describe("/api/quickbooks/connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockImplementation(async () => "clerk_admin");
    requireAdminOrAccountant.mockImplementation(async () => "clerk_user");
  });

  it("GET is guarded for an admin or an accountant, not for an admin only", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect((await res.json()).connections).toHaveLength(1);
    expect(requireAdminOrAccountant).toHaveBeenCalledTimes(1);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("GET answers 403 for a role that is neither, and reads nothing", async () => {
    requireAdminOrAccountant.mockImplementation(async () => {
      throw forbidden();
    });

    const res = await GET();

    expect(res.status).toBe(403);
    expect(getAllQboConnections).not.toHaveBeenCalled();
  });

  it("POST stays admin-only", async () => {
    requireAdmin.mockImplementation(async () => {
      throw forbidden();
    });

    const res = await POST(jsonRequest("POST", { displayName: "New" }));

    expect(res.status).toBe(403);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(requireAdminOrAccountant).not.toHaveBeenCalled();
  });

  it("PATCH stays admin-only", async () => {
    requireAdmin.mockImplementation(async () => {
      throw forbidden();
    });

    const res = await PATCH(jsonRequest("PATCH", { connectionId: "c1", displayName: "Renamed" }));

    expect(res.status).toBe(403);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(requireAdminOrAccountant).not.toHaveBeenCalled();
  });

  // docs/specs/qbo-invoice-03c-no-tax-code.md §4: the "no tax" code of a connection, saved by an
  // admin through the same PATCH as the Default Tax Code.
  describe("PATCH noTaxCodeId", () => {
    it("saves a tax code id, for an admin", async () => {
      const res = await PATCH(jsonRequest("PATCH", { connectionId: "c1", noTaxCodeId: "2" }));

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(requireAdmin).toHaveBeenCalledTimes(1);
      expect(updateQboConnectionNoTaxCode).toHaveBeenCalledWith("c1", "2");
    });

    it("clears the code on null", async () => {
      const res = await PATCH(jsonRequest("PATCH", { connectionId: "c1", noTaxCodeId: null }));

      expect(res.status).toBe(200);
      expect(updateQboConnectionNoTaxCode).toHaveBeenCalledWith("c1", null);
    });

    it.each([
      ["an empty string", ""],
      ["a number", 2],
      ["an object", {}],
    ])("answers 400 for %s and saves nothing", async (_label, value) => {
      const res = await PATCH(jsonRequest("PATCH", { connectionId: "c1", noTaxCodeId: value }));

      expect(res.status).toBe(400);
      expect(updateQboConnectionNoTaxCode).not.toHaveBeenCalled();
    });

    it("a body that forgot the value does not clear the code", async () => {
      const res = await PATCH(jsonRequest("PATCH", { connectionId: "c1" }));

      expect(res.status).toBe(400);
      expect(updateQboConnectionNoTaxCode).not.toHaveBeenCalled();
    });

    it("answers 403 for anyone but an admin and saves nothing", async () => {
      requireAdmin.mockImplementation(async () => {
        throw forbidden();
      });

      const res = await PATCH(jsonRequest("PATCH", { connectionId: "c1", noTaxCodeId: "2" }));

      expect(res.status).toBe(403);
      expect(updateQboConnectionNoTaxCode).not.toHaveBeenCalled();
    });

    it("leaves the Default Tax Code and the rename as they were", async () => {
      await PATCH(jsonRequest("PATCH", { connectionId: "c1", taxCodeId: "5" }));
      expect(updateQboConnectionTaxCode).toHaveBeenCalledWith("c1", "5");

      const rename = await PATCH(
        jsonRequest("PATCH", { connectionId: "c1", displayName: "Renamed" }),
      );
      expect(rename.status).toBe(200);
      expect(updateQboConnectionNoTaxCode).not.toHaveBeenCalled();
    });
  });

  it("DELETE stays admin-only", async () => {
    requireAdmin.mockImplementation(async () => {
      throw forbidden();
    });

    const res = await DELETE(
      new NextRequest("http://localhost:3000/api/quickbooks/connections?connectionId=c1", {
        method: "DELETE",
      }),
    );

    expect(res.status).toBe(403);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(requireAdminOrAccountant).not.toHaveBeenCalled();
  });
});
