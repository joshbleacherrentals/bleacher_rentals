import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "../../../../../database.types";
import { parseWpformsLead } from "@/features/leads/logic/parseWpformsLead";
import { createLeadQuote } from "@/features/leads/server/createLeadQuote";

/**
 * Creates a quote from a WPForms submission. Make.com's instant watcher calls it through an HTTP
 * module (POST, JSON body, header `x-webhook-secret`). `/api/webhooks(.*)` is public in the
 * middleware, so the shared secret is the only door.
 *
 * Env: WPFORMS_LEAD_SECRET (required), WPFORMS_LEAD_OWNER_USER_UUID (optional: the account manager
 * the new quotes are assigned to; without it they are unassigned).
 */

const sameSecret = (given: string | null, expected: string) => {
  const a = Buffer.from(given ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/** The body as received, for the quote's Submission tab; not kept when it is not an object or is huge. */
const MAX_SUBMISSION_CHARS = 100_000;
function rawSubmission(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  return JSON.stringify(body).length <= MAX_SUBMISSION_CHARS
    ? (body as Record<string, unknown>)
    : null;
}

export async function POST(req: NextRequest) {
  const secret = process.env.WPFORMS_LEAD_SECRET;
  if (!secret) {
    console.error("WPFORMS_LEAD_SECRET is not set.");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (!sameSecret(req.headers.get("x-webhook-secret"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const eventId = await createLeadQuote(
      supabase,
      parseWpformsLead(body),
      process.env.WPFORMS_LEAD_OWNER_USER_UUID || null,
      rawSubmission(body),
    );
    return NextResponse.json({ eventId, path: `/quotes-bookings/${eventId}` }, { status: 201 });
  } catch (error) {
    console.error("WPForms lead failed:", error);
    return NextResponse.json({ error: "Could not create the quote" }, { status: 500 });
  }
}
