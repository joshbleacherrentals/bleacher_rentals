import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMaybeSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

import { GET, parseVersionIdParam } from "./route";
import { NextRequest } from "next/server";

function makeRequest(id: string) {
  return [
    new NextRequest(`http://localhost/api/quotes/${id}/version`),
    { params: Promise.resolve({ id }) },
  ] as const;
}

describe("parseVersionIdParam", () => {
  it("classifies a numeric string as an invoice number", () => {
    expect(parseVersionIdParam("100123")).toEqual({ kind: "invoice_number", value: 100123 });
  });

  it("reads a number printed with nine digits as the same invoice number", () => {
    expect(parseVersionIdParam("000000042")).toEqual({ kind: "invoice_number", value: 42 });
  });

  it("classifies a valid UUID", () => {
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    expect(parseVersionIdParam(uuid)).toEqual({ kind: "uuid", value: uuid });
  });

  it.each(["1;DROP TABLE Events", "abc", "' OR 1=1 --", "", "3f2504e0-bad", "1.5"])(
    "rejects malformed / injection-style input: %s",
    (bad) => {
      expect(parseVersionIdParam(bad)).toBeNull();
    },
  );
});

describe("GET /api/quotes/[id]/version", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle });
    mockSelect.mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValue({ select: mockSelect });
  });

  it("returns both hashes for an existing event (by UUID)", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { content_hash: "aaa", contract_hash: "bbb" },
      error: null,
    });
    const uuid = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const [req, ctx] = makeRequest(uuid);
    const res = await GET(req, ctx as any);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contentHash: "aaa", contractHash: "bbb" });
    expect(mockEq).toHaveBeenCalledWith("id", uuid);
  });

  it("looks up by invoice_number for a numeric id", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { content_hash: "aaa", contract_hash: "bbb" },
      error: null,
    });
    const [req, ctx] = makeRequest("100777");
    await GET(req, ctx as any);
    expect(mockEq).toHaveBeenCalledWith("invoice_number", 100777);
  });

  it("returns 404 when the event does not resolve", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const [req, ctx] = makeRequest("3f2504e0-4f89-41d3-9a0c-0305e82c3301");
    const res = await GET(req, ctx as any);
    expect(res.status).toBe(404);
  });

  it("rejects an injection-style id WITHOUT ever querying the DB", async () => {
    const [req, ctx] = makeRequest("1;DROP TABLE Events");
    const res = await GET(req, ctx as any);
    expect(res.status).toBe(404);
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
