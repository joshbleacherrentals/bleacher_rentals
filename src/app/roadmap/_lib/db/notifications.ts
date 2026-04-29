import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";
import type { SupabaseClient } from "@supabase/supabase-js";

type UserIdRow = { id: string };

/**
 * Inserts one Notifications row per user. Uses the Supabase client because the
 * `Notifications` table is not synced via PowerSync, but the trigger on the
 * server-side fires the push notification edge function.
 */
export async function notifyAllUsers(opts: {
  supabase: SupabaseClient<any>;
  title: string;
  body: string;
}) {
  const compiled = db.selectFrom("Users").select(["Users.id as id"]).compile();
  const users = await typedGetAll(compiled, expect<UserIdRow>());

  if (users.length === 0) return;

  const rows = users.map((u) => ({
    user_id: u.id,
    title: opts.title,
    body: opts.body,
  }));

  await opts.supabase.from("Notifications").insert(rows);
}
