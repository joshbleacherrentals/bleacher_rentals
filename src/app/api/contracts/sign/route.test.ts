import { describe, it, expect, vi, beforeEach } from "vitest";

// Records every write so we can assert the 409 guard performs none.
const writes: Array<{ table: string; op: string; payload?: unknown }> = [];
let currentContractHash = "HASH_CURRENT";
// Signing moves content_hash: the signed state is part of what the public page
// shows, and a Postgres trigger recomputes it. The fake reproduces that so the
// route can be held to reading the hash AFTER the signature lands.
let signatureRecorded = false;
const CONTENT_BEFORE_SIGN = "CONTENT_BEFORE";
const CONTENT_AFTER_SIGN = "CONTENT_AFTER";

function makeBuilder(table: string) {
  const state: { table: string; op: string; cols?: string } = { table, op: "select" };
  const resolve = () => {
    if (state.table === "Events" && state.op === "select" && state.cols?.includes("content_hash")) {
      return {
        data: {
          content_hash: signatureRecorded ? CONTENT_AFTER_SIGN : CONTENT_BEFORE_SIGN,
        },
        error: null,
      };
    }
    if (
      state.table === "Events" &&
      state.op === "select" &&
      state.cols?.includes("contract_hash")
    ) {
      return { data: { contract_hash: currentContractHash }, error: null };
    }
    if (state.table === "Events" && state.op === "select") {
      return { data: { event_status: "draft" }, error: null };
    }
    if (state.table === "ContractSignatures" && state.op === "insert") {
      signatureRecorded = true;
      return { data: { id: "sig-1", signed_at: "2026-08-04T00:00:00Z" }, error: null };
    }
    return { data: null, error: null };
  };
  const b: any = {
    select: (cols: string) => {
      state.cols = cols;
      return b;
    },
    insert: (payload: unknown) => {
      state.op = "insert";
      writes.push({ table, op: "insert", payload });
      return b;
    },
    update: (payload: unknown) => {
      state.op = "update";
      writes.push({ table, op: "update", payload });
      return b;
    },
    eq: () => b,
    maybeSingle: () => Promise.resolve(resolve()),
    single: () => Promise.resolve(resolve()),
    then: (onF: any, onR: any) => Promise.resolve(resolve()).then(onF, onR),
  };
  return b;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => makeBuilder(table),
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
  }),
}));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: () => Promise.resolve(Buffer.from("")) }));
vi.mock("@/features/quotesAndBookings/pdf/QuotePdfDocument", () => ({
  QuotePdfDocument: () => null,
}));
vi.mock("@/features/quotesAndBookings/pdf/quoteDocumentData", () => ({
  buildQuoteDocumentData: () => Promise.resolve(null), // skips PDF generation branch
}));
vi.mock("@/features/quotesAndBookings/db/logEventChanges", () => ({
  logSingleChange: () => Promise.resolve(),
}));

import { POST, maxDuration } from "./route";
import { NextRequest } from "next/server";

function signRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/contracts/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  eventId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  termsAndConditionsUuid: "b1a5f0e2-1111-2222-3333-444455556666",
  signerName: "Jane Client",
};

describe("POST /api/contracts/sign — sign-time guard", () => {
  beforeEach(() => {
    writes.length = 0;
    currentContractHash = "HASH_CURRENT";
    signatureRecorded = false;
  });

  it("sets a longer maxDuration so the signed emails are not cut off", () => {
    // Rendering the signed PDF takes ~8 s, and the client and account-manager emails are sent
    // after it. On the 10 s default, Vercel killed the request before the account-manager email
    // (sent last) went out, so account managers were never told a client had signed.
    expect(maxDuration).toBe(60);
  });

  it("returns 409 and performs NO write when the contract hash changed", async () => {
    const res = await POST(signRequest({ ...VALID, expectedContractHash: "HASH_OLD" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("quote_changed");
    expect(writes).toHaveLength(0); // no invalidate, no insert, no status change
  });

  it("signs and stores signed_contract_hash when the hash matches", async () => {
    const res = await POST(signRequest({ ...VALID, expectedContractHash: "HASH_CURRENT" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ signatureId: "sig-1" });
    const insert = writes.find((w) => w.table === "ContractSignatures" && w.op === "insert");
    expect(insert?.payload).toMatchObject({ signed_contract_hash: "HASH_CURRENT" });
  });

  it("returns the content hash the signature produced, so the page can rebase", async () => {
    // Without this the public page keeps its page-load baseline, sees the hash
    // the client's own signature moved, and tells them the quote was updated.
    // See docs/specs/payment-does-not-invalidate-signature.md §8.
    const res = await POST(signRequest({ ...VALID, expectedContractHash: "HASH_CURRENT" }));

    expect(await res.json()).toMatchObject({
      signatureId: "sig-1",
      contentHash: CONTENT_AFTER_SIGN,
    });
  });

  it("returns 400 when expectedContractHash is missing", async () => {
    const res = await POST(signRequest({ ...VALID }));
    expect(res.status).toBe(400);
    expect(writes).toHaveLength(0);
  });
});
