import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let userId: string | null = "user_1";
let eventStatus: string | null = "booked";
const sendTriggerEmail = vi.fn();

vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId }) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { event_status: eventStatus } }) }),
      }),
    }),
  }),
}));
vi.mock("@/features/automaticEmails/server/sendTriggerEmail", () => ({
  FINANCE_EMAIL: "finance@bleacherrentals.com",
  sendTriggerEmail: (...args: unknown[]) => sendTriggerEmail(...args),
}));

import { POST } from "./route";

const call = () =>
  POST(
    new NextRequest("http://localhost:3000/api/quotes/evt-1/booked-notice", { method: "POST" }),
    {
      params: Promise.resolve({ id: "evt-1" }),
    },
  );

describe("POST /api/quotes/[id]/booked-notice", () => {
  beforeEach(() => {
    userId = "user_1";
    eventStatus = "booked";
    sendTriggerEmail.mockReset();
    sendTriggerEmail.mockResolvedValue({ sent: true, to: "finance@bleacherrentals.com" });
  });

  it("refuses a caller who is not signed in", async () => {
    userId = null;
    const res = await call();
    expect(res.status).toBe(401);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });

  it("emails finance, and only finance, for a booked quote", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(sendTriggerEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-1",
        recipientOverride: "finance@bleacherrentals.com",
      }),
    );
  });

  it("will not email finance about a quote that is not booked", async () => {
    eventStatus = "draft";
    vi.useFakeTimers();
    const pending = call();
    await vi.advanceTimersByTimeAsync(11_000);
    const res = await pending;
    vi.useRealTimers();
    expect(res.status).toBe(409);
    expect(sendTriggerEmail).not.toHaveBeenCalled();
  });
});
