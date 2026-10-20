import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createLeadQuote: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));
vi.mock("@/features/leads/server/createLeadQuote", () => ({
  createLeadQuote: mocks.createLeadQuote,
}));

import { POST } from "./route";

const call = (init: { secret?: string | null; body?: string }) =>
  POST(
    new Request("http://localhost/api/webhooks/wpforms-lead", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(init.secret === null ? {} : { "x-webhook-secret": init.secret ?? "s3cret" }),
      },
      body: init.body ?? "{}",
    }) as never,
  );

beforeEach(() => {
  mocks.createLeadQuote.mockReset().mockResolvedValue("ev-1");
  process.env.WPFORMS_LEAD_SECRET = "s3cret";
  delete process.env.WPFORMS_LEAD_OWNER_USER_UUID;
});

describe("POST /api/webhooks/wpforms-lead", () => {
  it("refuses when the secret is not configured, and never creates anything", async () => {
    delete process.env.WPFORMS_LEAD_SECRET;
    expect((await call({})).status).toBe(500);
    expect(mocks.createLeadQuote).not.toHaveBeenCalled();
  });

  it("refuses a missing or wrong secret", async () => {
    expect((await call({ secret: null })).status).toBe(401);
    expect((await call({ secret: "nope" })).status).toBe(401);
    expect((await call({ secret: "s3cret-and-more" })).status).toBe(401);
    expect(mocks.createLeadQuote).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    expect((await call({ body: "not json" })).status).toBe(400);
    expect(mocks.createLeadQuote).not.toHaveBeenCalled();
  });

  it("creates the quote from the lead and answers with its id", async () => {
    const res = await call({ body: JSON.stringify({ name: "Ada Lovelace", event_name: "Gala" }) });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ eventId: "ev-1", path: "/quotes-bookings/ev-1" });
    const [, lead, owner, submission] = mocks.createLeadQuote.mock.calls[0];
    expect(submission).toEqual({ name: "Ada Lovelace", event_name: "Gala" });
    expect(lead).toMatchObject({ firstName: "Ada", lastName: "Lovelace", eventName: "Gala" });
    expect(owner).toBeNull();
  });

  it("keeps no submission when the body is not an object or is huge", async () => {
    await call({ body: JSON.stringify(["a"]) });
    expect(mocks.createLeadQuote.mock.calls[0][3]).toBeNull();
    await call({ body: JSON.stringify({ comment: "x".repeat(100_001) }) });
    expect(mocks.createLeadQuote.mock.calls[1][3]).toBeNull();
  });

  it("assigns the owner from the environment", async () => {
    process.env.WPFORMS_LEAD_OWNER_USER_UUID = "user-9";
    await call({});
    expect(mocks.createLeadQuote.mock.calls[0][2]).toBe("user-9");
  });

  it("accepts a nearly blank submission", async () => {
    expect((await call({ body: "{}" })).status).toBe(201);
  });

  it("answers 500 without details when creating fails", async () => {
    mocks.createLeadQuote.mockRejectedValue(new Error("boom: secret detail"));
    const res = await call({});
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });
});
