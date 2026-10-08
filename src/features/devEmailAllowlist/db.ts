import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

// Writes to the development email allowlist. Local first: PowerSync uploads them, and RLS lets
// only developers through (supabase/migrations/20261007120000_dev_allowed_emails.sql). Callers
// pass an address that has already been through validateAllowedEmail.

export async function addAllowedEmail(email: string): Promise<void> {
  await typedExecute(
    db
      .insertInto("DevAllowedEmails")
      .values({ id: crypto.randomUUID(), email, created_at: new Date().toISOString() })
      .compile(),
  );
}

export async function updateAllowedEmail(id: string, email: string): Promise<void> {
  await typedExecute(
    db.updateTable("DevAllowedEmails").set({ email }).where("id", "=", id).compile(),
  );
}

export async function deleteAllowedEmail(id: string): Promise<void> {
  await typedExecute(db.deleteFrom("DevAllowedEmails").where("id", "=", id).compile());
}
