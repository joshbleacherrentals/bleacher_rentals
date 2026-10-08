import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, insertMock, state } = vi.hoisted(() => ({
  authMock: vi.fn(),
  insertMock: vi.fn(),
  state: { insertError: null as { message: string } | null },
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => ({
      insert: (rows: unknown[]) => {
        insertMock(table, rows);
        return Promise.resolve({ error: state.insertError });
      },
    }),
  }),
}));

import { NextRequest } from "next/server";
import { POST } from "./route";

const valid = (over: Record<string, unknown> = {}) => ({
  name: "app.telemetry_dropped",
  durationMs: null,
  outcome: "ok",
  errorKind: null,
  at: 1_700_000_000_000,
  sessionId: "3f2b8c1e-5d4a-4b7e-9c1a-2f6d8e0a1b3c",
  tabRole: "leader",
  appVersion: "1.16.0",
  env: "production",
  browser: "chrome 141",
  os: "macos",
  deviceClass: "desktop",
  network: null,
  roles: ["admin"],
  attrs: { dropped: 1 },
  ...over,
});

function request(body: unknown, raw = false) {
  return new NextRequest("http://localhost:3000/api/telemetry", {
    method: "POST",
    body: raw ? (body as string) : JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  authMock.mockReset();
  insertMock.mockReset();
  state.insertError = null;
  authMock.mockResolvedValue({ userId: "user_2abcDEF" });
});

describe("POST /api/telemetry", () => {
  it("answers 401 without a session and writes nothing", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await POST(request({ events: [valid()] }));
    expect(res.status).toBe(401);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("stores a valid batch and says how many", async () => {
    const res = await POST(request({ events: [valid(), valid()] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 2, dropped: 0 });
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertMock.mock.calls[0][0]).toBe("PerfEvents");
    expect(insertMock.mock.calls[0][1]).toHaveLength(2);
  });

  it("keeps the valid events of a batch with one bad event and reports it", async () => {
    const res = await POST(request({ events: [valid(), valid({ name: "nope" }), valid()] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 2, dropped: 1 });
    expect(insertMock.mock.calls[0][1]).toHaveLength(2);
  });

  it("answers 400 when no event in the batch is valid", async () => {
    const res = await POST(request({ events: [valid({ name: "nope" })] }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("answers 400 for an empty batch, a missing events array and invalid JSON", async () => {
    expect((await POST(request({ events: [] }))).status).toBe(400);
    expect((await POST(request({}))).status).toBe(400);
    expect((await POST(request("{not json", true))).status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("answers 413 for more than 100 events", async () => {
    const events = Array.from({ length: 101 }, () => valid());
    const res = await POST(request({ events }));
    expect(res.status).toBe(413);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 100 events", async () => {
    const events = Array.from({ length: 100 }, () => valid());
    const res = await POST(request({ events }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ accepted: 100, dropped: 0 });
  });

  it("answers 413 for a body over 64 KB", async () => {
    const res = await POST(request({ events: [valid()], padding: "x".repeat(65 * 1024) }));
    expect(res.status).toBe(413);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("answers 500 on a database error and does not leak its message", async () => {
    state.insertError = { message: 'relation "PerfEvents" does not exist' };
    const res = await POST(request({ events: [valid()] }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("PerfEvents");
  });

  it("never writes the Clerk user id", async () => {
    await POST(request({ events: [valid({ userId: "user_2abcDEF", email: "a@b.c" })] }));
    expect(JSON.stringify(insertMock.mock.calls[0][1])).not.toContain("user_2abcDEF");
    expect(JSON.stringify(insertMock.mock.calls[0][1])).not.toContain("a@b.c");
  });

  it("strips attrs keys that are off the allow-list before storing", async () => {
    await POST(request({ events: [valid({ attrs: { dropped: 1, sql: "select *" } })] }));
    expect(insertMock.mock.calls[0][1][0].attrs).toEqual({ dropped: 1 });
  });

  it("responds with nothing but the two counts", async () => {
    const res = await POST(request({ events: [valid()] }));
    expect(Object.keys(await res.json()).sort()).toEqual(["accepted", "dropped"]);
  });
});
