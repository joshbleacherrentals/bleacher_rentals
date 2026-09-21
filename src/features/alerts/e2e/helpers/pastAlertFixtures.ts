import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

/**
 * Service-role seeding for "no alerts in the past" (docs/specs/no-past-alerts.md).
 *
 * The rule is enforced in three places; this covers the one no unit test can reach: the alerts
 * dropdown reads each alert's entity date through a join and hides the alert once that date has
 * passed. Only a browser with a replicated PowerSync database exercises that query.
 */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for e2e fixture seeding",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SeededPastAlerts = {
  /** Message of the alert on an event that ended yesterday — must never be shown. */
  pastMessage: string;
  /** Message of the alert on an event next week — must still be shown. */
  currentMessage: string;
  cleanup: () => Promise<void>;
};

/** Toronto dates, the clock the rule uses. */
function torontoDate(offsetDays: number): string {
  return DateTime.now().setZone("America/Toronto").plus({ days: offsetDays }).toISODate()!;
}

/**
 * One alert on an event that ended yesterday and one on an event that runs next week, both
 * addressed to the admin e2e user. The events are named with a run-specific tag so parallel specs
 * and seed data cannot collide.
 */
export async function seedPastAndCurrentAlerts(): Promise<SeededPastAlerts> {
  const supabase = adminClient();
  const email = process.env.E2E_ADMIN_EMAIL;
  if (!email) throw new Error("Missing E2E_ADMIN_EMAIL for e2e fixture seeding");

  const { data: user, error: userError } = await supabase
    .from("Users")
    .select("id")
    .eq("email", email)
    .single();
  if (userError || !user) {
    throw new Error(`fixture user lookup failed for admin: ${userError?.message}`);
  }

  const tag = randomUUID().slice(0, 8);
  const eventIds = { past: randomUUID(), current: randomUUID() };
  const alertIds = { past: randomUUID(), current: randomUUID() };
  const userAlertIds = { past: randomUUID(), current: randomUUID() };

  const pastMessage = `PAST ALERT ${tag} — must not be shown`;
  const currentMessage = `CURRENT ALERT ${tag} — must be shown`;

  const { error: eventsError } = await supabase.from("Events").insert([
    {
      id: eventIds.past,
      event_name: `Past Alert Fixture ${tag}`,
      event_start: torontoDate(-3),
      event_end: torontoDate(-1),
      event_status: "booked",
      lenient: false,
      deleted: false,
      created_by_user_uuid: user.id,
    },
    {
      id: eventIds.current,
      event_name: `Current Alert Fixture ${tag}`,
      event_start: torontoDate(5),
      event_end: torontoDate(7),
      event_status: "booked",
      lenient: false,
      deleted: false,
      created_by_user_uuid: user.id,
    },
  ]);
  if (eventsError) throw new Error(`fixture event insert failed: ${eventsError.message}`);

  const { error: alertsError } = await supabase.from("Alerts").insert([
    {
      id: alertIds.past,
      entity_uuid: eventIds.past,
      entity_type: "event",
      title: "Event Requirements Not Met",
      message: pastMessage,
      entity_description: `Past Alert Fixture ${tag}`,
    },
    {
      id: alertIds.current,
      entity_uuid: eventIds.current,
      entity_type: "event",
      title: "Event Requirements Not Met",
      message: currentMessage,
      entity_description: `Current Alert Fixture ${tag}`,
    },
  ]);
  if (alertsError) throw new Error(`fixture alert insert failed: ${alertsError.message}`);

  const { error: userAlertsError } = await supabase.from("UserAlerts").insert([
    { id: userAlertIds.past, alert_uuid: alertIds.past, user_uuid: user.id, dismissed: false },
    {
      id: userAlertIds.current,
      alert_uuid: alertIds.current,
      user_uuid: user.id,
      dismissed: false,
    },
  ]);
  if (userAlertsError) {
    throw new Error(`fixture user alert insert failed: ${userAlertsError.message}`);
  }

  return {
    pastMessage,
    currentMessage,
    cleanup: async () => {
      const client = adminClient();
      await client.from("UserAlerts").delete().in("id", Object.values(userAlertIds));
      await client.from("Alerts").delete().in("id", Object.values(alertIds));
      await client.from("Events").delete().in("id", Object.values(eventIds));
    },
  };
}
