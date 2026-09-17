import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { Database } from "../../../../../database.types";
import { todayStart, getUpcomingWindowEnd } from "@/features/alerts/util/getUpcomingWindow";
import { AlertEntityType } from "@/features/alerts/types";
import { evaluateWorkTrackerPending } from "@/features/alerts/evaluate/workTrackerPending";

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type AdminClient = ReturnType<typeof getSupabaseAdmin>;

/**
 * Upserts a single alert (and its UserAlerts) directly via Supabase.
 * Pass message=null to clear the alert if it exists.
 */
async function syncServerAlert(
  supabase: AdminClient,
  entityUuid: string,
  entityType: AlertEntityType,
  title: string,
  message: string | null,
  entityDescription: string,
  recipientUuids: string[],
) {
  const { data: existing } = await supabase
    .from("Alerts")
    .select("id, entity_description")
    .eq("entity_uuid", entityUuid)
    .eq("entity_type", entityType)
    .eq("title", title);

  if (!message) {
    for (const row of existing ?? []) {
      await supabase.from("UserAlerts").delete().eq("alert_uuid", row.id);
      await supabase.from("Alerts").delete().eq("id", row.id);
    }
    return;
  }

  const uniqueRecipients = [...new Set(recipientUuids.filter(Boolean))];

  if (existing && existing.length > 0) {
    const row = existing[0];
    if (row.entity_description !== entityDescription) {
      await supabase
        .from("Alerts")
        .update({ entity_description: entityDescription })
        .eq("id", row.id);
    }
    for (const userUuid of uniqueRecipients) {
      const { data: ua } = await supabase
        .from("UserAlerts")
        .select("id")
        .eq("alert_uuid", row.id)
        .eq("user_uuid", userUuid)
        .maybeSingle();
      if (!ua) {
        await supabase.from("UserAlerts").insert({
          id: crypto.randomUUID(),
          alert_uuid: row.id,
          user_uuid: userUuid,
        });
      }
    }
  } else {
    const alertId = crypto.randomUUID();
    await supabase.from("Alerts").insert({
      id: alertId,
      entity_uuid: entityUuid,
      entity_type: entityType,
      title,
      message,
      entity_description: entityDescription,
    });
    for (const userUuid of uniqueRecipients) {
      await supabase.from("UserAlerts").insert({
        id: crypto.randomUUID(),
        alert_uuid: alertId,
        user_uuid: userUuid,
      });
    }
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const windowStart = todayStart();
    const windowEnd = getUpcomingWindowEnd();

    // ── Work Tracker Alerts ──────────────────────────────────────────────────
    const { data: workTrackers } = await supabase
      .from("WorkTrackers")
      .select(
        "id, status, date, released_at, accepted_at, created_by_user_uuid, Bleachers!WorkTrackers_bleacher_uuid_fkey(bleacher_number)",
      )
      .gte("date", windowStart)
      .lte("date", windowEnd);

    for (const wt of workTrackers ?? []) {
      const bleacherNum =
        wt.Bleachers && !Array.isArray(wt.Bleachers) ? wt.Bleachers.bleacher_number : null;
      const recipients = wt.created_by_user_uuid ? [wt.created_by_user_uuid] : [];

      const wtRow = {
        id: wt.id,
        status: wt.status,
        date: wt.date,
        released_at: wt.released_at,
        accepted_at: wt.accepted_at,
        bleacher_number: bleacherNum,
        created_by_user_uuid: wt.created_by_user_uuid,
      };

      const pendingResult = evaluateWorkTrackerPending(wtRow);
      await syncServerAlert(
        supabase,
        wt.id,
        "work_tracker",
        "Work Tracker Pending Acceptance",
        pendingResult?.message ?? null,
        pendingResult?.entityDescription ?? "",
        recipients,
      );
    }

    // ── Discontinued alert: purge any leftover "Work Tracker Still in Draft" rows ──
    const { data: discontinued } = await supabase
      .from("Alerts")
      .select("id")
      .eq("title", "Work Tracker Still in Draft");
    for (const alert of discontinued ?? []) {
      await supabase.from("UserAlerts").delete().eq("alert_uuid", alert.id);
      await supabase.from("Alerts").delete().eq("id", alert.id);
    }

    // ── Clean up alerts for past entities ────────────────────────────────────
    const { data: staleAlerts } = await supabase
      .from("Alerts")
      .select("id, entity_uuid, entity_type");

    for (const alert of staleAlerts ?? []) {
      if (!alert.entity_uuid) continue;

      let isPast = false;
      if (alert.entity_type === "event") {
        const { data: ev } = await supabase
          .from("Events")
          .select("event_end")
          .eq("id", alert.entity_uuid)
          .single();
        isPast = !ev || ev.event_end < windowStart;
      } else if (alert.entity_type === "bleacher_event") {
        const { data: be } = await supabase
          .from("BleacherEvents")
          .select("Events!inner(event_end)")
          .eq("id", alert.entity_uuid)
          .single();
        const ev = be?.Events && !Array.isArray(be.Events) ? be.Events : null;
        isPast = !ev || ev.event_end < windowStart;
      } else if (alert.entity_type === "work_tracker") {
        const { data: wt } = await supabase
          .from("WorkTrackers")
          .select("date")
          .eq("id", alert.entity_uuid)
          .single();
        isPast = !wt || (wt.date != null && wt.date < windowStart);
      }

      if (isPast) {
        await supabase.from("UserAlerts").delete().eq("alert_uuid", alert.id);
        await supabase.from("Alerts").delete().eq("id", alert.id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[alerts cron] failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
