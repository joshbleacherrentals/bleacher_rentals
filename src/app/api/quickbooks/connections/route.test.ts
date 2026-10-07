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
  { id: "c1", display_name: "Main", realm_id: "r1", qbo_tax_code_id: null, currency: "CAD" },
]);
vi.mock("@/features/quickbooks-integration/db", () => ({
  getAllQboConnections: (...args: unknown[]) => (getAllQboConnections as any)(...args),
  createQboConnectionPlaceholder: vi.fn(async () => "new-id"),
  deleteQboConnection: vi.fn(async () => undefined),
  updateQboConnectionDisplayName: vi.fn(async () => undefined),
  updateQboConnectionTaxCode: vi.fn(async () => undefined),
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
