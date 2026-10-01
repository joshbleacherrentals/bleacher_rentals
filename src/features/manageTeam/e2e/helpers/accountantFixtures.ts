import { createClient } from "@supabase/supabase-js";

/**
 * Removes the user an accountant-invite spec created. `Accountants.user_uuid`
 * cascades, so deleting the `Users` row takes the role row with it.
 *
 * Service role, because the UI deliberately has no "delete user" — only
 * deactivation — and a spec must not leave a real-looking team member behind.
 */
export async function deleteUserByEmail(email: string): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY for e2e cleanup");
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.from("Users").delete().eq("email", email.toLowerCase());
  if (error) throw new Error(`fixture user cleanup failed: ${error.message}`);
}
