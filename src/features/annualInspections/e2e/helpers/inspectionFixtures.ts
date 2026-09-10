import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for seeding annual-inspection fixtures below the UI.
 *
 * Needed for two things the UI cannot produce: a due date that has already
 * gone past (the form writes what you type, but the queue has to be *sorted*
 * before anyone opens it), and a user whose `inspection_queue_last_seen_at` is
 * back to null — the highlight is measured against that column, so a spec that
 * did not reset it would pass on a clean database and fail on the second run.
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

/** A calendar date `days` from today, as "YYYY-MM-DD". */
export function daysFromToday(days: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days));
  return d.toISOString().slice(0, 10);
}

export type SeededBleacher = {
  bleacherUuid: string;
  bleacherNumber: number;
};

export type InspectionFixture = {
  bleachers: SeededBleacher[];
  cleanup: () => Promise<void>;
};

/**
 * Seeds one bleacher per entry. `null` means "never scheduled" — no inspection
 * row at all, which is a state the queue has to render.
 *
 * Bleacher numbers are namespaced high (bleacher_number is a smallint, max
 * 32767) so they sort and read clearly apart from the real fleet.
 */
export async function seedBleachersWithInspections(
  nextDueDates: (string | null)[],
): Promise<InspectionFixture> {
  const supabase = adminClient();
  const base = 30000 + Math.floor(Math.random() * 2000);
  const bleachers: SeededBleacher[] = [];

  for (const [index, nextDueOn] of nextDueDates.entries()) {
    const bleacherNumber = base + index;
    const { data: bleacher, error } = await supabase
      .from("Bleachers")
      .insert({ bleacher_number: bleacherNumber, bleacher_rows: 5, bleacher_seats: 50 })
      .select("id, bleacher_number")
      .single();
    if (error || !bleacher) throw new Error(`fixture bleacher seed failed: ${error?.message}`);

    if (nextDueOn) {
      const { error: inspectionError } = await supabase
        .from("BleacherAnnualInspections")
        .insert({ bleacher_uuid: bleacher.id, next_due_on: nextDueOn });
      if (inspectionError) {
        throw new Error(`fixture inspection seed failed: ${inspectionError.message}`);
      }
    }

    bleachers.push({ bleacherUuid: bleacher.id, bleacherNumber });
  }

  return {
    bleachers,
    cleanup: async () => {
      // Inspections cascade with the bleacher.
      await supabase
        .from("Bleachers")
        .delete()
        .in(
          "id",
          bleachers.map((b) => b.bleacherUuid),
        );
    },
  };
}

/** Rewinds a user to "has never opened the queue", or to a given moment. */
export async function setInspectionQueueLastSeen(
  email: string,
  value: string | null,
): Promise<void> {
  const supabase = adminClient();
  const { error } = await supabase
    .from("Users")
    .update({ inspection_queue_last_seen_at: value })
    .eq("email", email);
  if (error) throw new Error(`could not reset inspection_queue_last_seen_at: ${error.message}`);
}
