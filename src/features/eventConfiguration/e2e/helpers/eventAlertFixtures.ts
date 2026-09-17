import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";

/**
 * Service-role seeding for the event form's in-memory alerts.
 *
 * These alerts are computed in the browser from PowerSync data, so a fixture has
 * to put rows in Postgres and then let them replicate. There is no web UI that
 * can produce two booked events sharing a bleacher in one step, which is the
 * state `schedulingConflict` exists to complain about.
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

async function userIdFor(email: string | undefined, label: string): Promise<string> {
  if (!email) throw new Error(`Missing ${label} for e2e fixture seeding`);
  const supabase = adminClient();
  const { data, error } = await supabase.from("Users").select("id").eq("email", email).single();
  if (error || !data) throw new Error(`fixture user lookup failed for ${label}: ${error?.message}`);
  return data.id;
}

export type SeededEventAlert = {
  /** The event the spec opens. */
  eventUuid: string;
  eventName: string;
  /** The second event it collides with, by name. */
  otherEventName: string;
  bleacherUuid: string;
  bleacherNumber: number;
  bleacherSeats: number;
  street: string;
  cleanup: () => Promise<void>;
};

type ConflictOptions = {
  /**
   * Seats requested by the event under test. Leave equal to the bleacher's seats
   * for a clean `eventRequirements` result.
   */
  totalSeats?: number;
  /** Seed only one event, so nothing can collide. */
  withoutConflict?: boolean;
  /**
   * Give both events an explicit setup date. The default is the case that was
   * broken for years: no setup_start, which reached the form as "" and made
   * every date comparison in `schedulingConflict` fall through an Invalid Date.
   */
  withExplicitSetup?: boolean;
  /** Owner of the seeded events; defaults to the admin e2e user. */
  ownerEmail?: string;
};

/**
 * Two booked events on the same bleacher, overlapping in time.
 *
 * Dates sit far in the future and the bleacher number is outside the real fleet
 * range, so parallel specs cannot collide with each other or with seed data.
 */
export async function seedSchedulingConflict(
  opts: ConflictOptions = {},
): Promise<SeededEventAlert> {
  const supabase = adminClient();
  const ownerUuid = await userIdFor(
    opts.ownerEmail ?? process.env.E2E_ADMIN_EMAIL,
    "E2E_ADMIN_EMAIL",
  );

  const tag = randomUUID().slice(0, 8);
  const eventName = `e2e-conflict-${tag}`;
  const otherEventName = `e2e-other-${tag}`;
  const street = `${1000 + Math.floor(Math.random() * 8000)} E2E Alert Way`;

  const start = DateTime.now()
    .plus({ weeks: 40 + Math.floor(Math.random() * 400) })
    .startOf("day");

  const { data: address, error: addressError } = await supabase
    .from("Addresses")
    .insert({ street, city: "Springfield", state_province: "IL", zip_postal: "62701" })
    .select("id")
    .single();
  if (addressError || !address) {
    throw new Error(`fixture address seed failed: ${addressError?.message}`);
  }

  const bleacherSeats = 50;
  const { data: bleacher, error: bleacherError } = await supabase
    .from("Bleachers")
    .insert({
      // bleacher_number is a smallint (max 32767), and the swap fixtures already
      // occupy 30000-31999. This range is clear of both, and of the real fleet.
      bleacher_number: 28000 + Math.floor(Math.random() * 1500),
      bleacher_rows: 5,
      bleacher_seats: bleacherSeats,
    })
    .select("id, bleacher_number")
    .single();
  if (bleacherError || !bleacher) {
    throw new Error(`fixture bleacher seed failed: ${bleacherError?.message}`);
  }

  const setup = opts.withExplicitSetup ? start.minus({ days: 1 }).toISODate() : null;
  const baseEvent = {
    event_status: "booked" as const,
    lenient: true,
    address_uuid: address.id,
    created_by_user_uuid: ownerUuid,
    setup_start: setup,
  };

  const rows = [
    {
      ...baseEvent,
      event_name: eventName,
      event_start: start.toISODate()!,
      event_end: start.plus({ days: 2 }).toISODate()!,
      total_seats: opts.totalSeats ?? bleacherSeats,
    },
  ];
  if (!opts.withoutConflict) {
    rows.push({
      ...baseEvent,
      event_name: otherEventName,
      // Overlaps the first by a day.
      event_start: start.plus({ days: 1 }).toISODate()!,
      event_end: start.plus({ days: 3 }).toISODate()!,
      total_seats: bleacherSeats,
    });
  }

  const { data: events, error: eventError } = await supabase
    .from("Events")
    .insert(rows)
    .select("id, event_name");
  if (eventError || !events) throw new Error(`fixture event seed failed: ${eventError?.message}`);

  const { error: linkError } = await supabase
    .from("BleacherEvents")
    .insert(events.map((e) => ({ bleacher_uuid: bleacher.id, event_uuid: e.id })));
  if (linkError) throw new Error(`fixture bleacher-event link failed: ${linkError.message}`);

  const target = events.find((e) => e.event_name === eventName)!;

  return {
    eventUuid: target.id,
    eventName,
    otherEventName,
    bleacherUuid: bleacher.id,
    bleacherNumber: bleacher.bleacher_number,
    bleacherSeats,
    street,
    cleanup: async () => {
      await supabase
        .from("BleacherEvents")
        .delete()
        .in(
          "event_uuid",
          events.map((e) => e.id),
        );
      await supabase
        .from("Events")
        .delete()
        .in(
          "id",
          events.map((e) => e.id),
        );
      await supabase.from("Bleachers").delete().eq("id", bleacher.id);
      await supabase.from("Addresses").delete().eq("id", address.id);
    },
  };
}

/**
 * The bleacher's last known location before the event, at a different street.
 *
 * `useEventFormTransportationAlerts` reads this to decide nothing is bringing the
 * bleacher to the new address. Seeded as a past booked event so the two alert
 * families can be shown coexisting.
 */
export async function seedPriorLocation(fixture: SeededEventAlert): Promise<() => Promise<void>> {
  const supabase = adminClient();
  const ownerUuid = await userIdFor(process.env.E2E_ADMIN_EMAIL, "E2E_ADMIN_EMAIL");

  const { data: address, error: addressError } = await supabase
    .from("Addresses")
    .insert({
      street: `${fixture.street} — elsewhere`,
      city: "Shelbyville",
      state_province: "IL",
      zip_postal: "62565",
    })
    .select("id")
    .single();
  if (addressError || !address) {
    throw new Error(`fixture prior address seed failed: ${addressError?.message}`);
  }

  const past = DateTime.now().plus({ weeks: 2 }).startOf("day");
  const { data: event, error: eventError } = await supabase
    .from("Events")
    .insert({
      event_name: `e2e-prior-${randomUUID().slice(0, 8)}`,
      event_start: past.toISODate()!,
      event_end: past.plus({ days: 1 }).toISODate()!,
      event_status: "booked",
      lenient: true,
      address_uuid: address.id,
      created_by_user_uuid: ownerUuid,
    })
    .select("id")
    .single();
  if (eventError || !event) {
    throw new Error(`fixture prior event seed failed: ${eventError?.message}`);
  }

  const { error: linkError } = await supabase
    .from("BleacherEvents")
    .insert({ bleacher_uuid: fixture.bleacherUuid, event_uuid: event.id });
  if (linkError) throw new Error(`fixture prior link failed: ${linkError.message}`);

  return async () => {
    await supabase.from("BleacherEvents").delete().eq("event_uuid", event.id);
    await supabase.from("Events").delete().eq("id", event.id);
    await supabase.from("Addresses").delete().eq("id", address.id);
  };
}
