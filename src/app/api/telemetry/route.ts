import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  MAX_BATCH_BYTES,
  MAX_BATCH_EVENTS,
  eventToRow,
  validateBatch,
} from "@/lib/perf/telemetryEvent";

// Never cache a write.
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Receives a batch of performance events from a signed-in browser.
 * Spec: docs/specs/perf-telemetry-pipeline.md §6.
 *
 * The Clerk `userId` proves a session exists and is then discarded: it is not stored, so
 * no row can be traced to a person. The table has no RLS policy, so only this route's
 * service-role key can write it.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BATCH_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BATCH_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const batch = validateBatch(body);
  if (!batch || batch.total === 0) {
    return NextResponse.json({ error: "No events" }, { status: 400 });
  }
  if (batch.total > MAX_BATCH_EVENTS) {
    return NextResponse.json({ error: "Too many events" }, { status: 413 });
  }
  if (batch.events.length === 0) {
    return NextResponse.json({ error: "No valid events" }, { status: 400 });
  }

  const { error } = await getSupabaseAdmin()
    .from("PerfEvents")
    .insert(batch.events.map(eventToRow));

  if (error) {
    // The database message can name tables and columns; the browser gets nothing of it.
    console.error("[telemetry] insert failed:", error.message);
    return NextResponse.json({ error: "Could not store events" }, { status: 500 });
  }

  return NextResponse.json({ accepted: batch.events.length, dropped: batch.dropped });
}
