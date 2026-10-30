import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

// Writes to the blocked customer emails list. Local first: PowerSync uploads them. Row-level
// security lets anyone add a row naming themselves as the creator, and only that creator change or
// remove it (supabase/migrations/20261027120000_email_messages.sql). Callers pass an address that
// has already been through validateAllowedEmail.

export async function addBlockedEmail(email: string, userUuid: string): Promise<void> {
  const now = new Date().toISOString();
  await typedExecute(
    db
      .insertInto("BlockedCustomerEmails")
      .values({
        id: crypto.randomUUID(),
        email,
        created_by_user_uuid: userUuid,
        created_at: now,
        updated_at: now,
      })
      .compile(),
  );
}

export async function updateBlockedEmail(id: string, email: string): Promise<void> {
  await typedExecute(
    db
      .updateTable("BlockedCustomerEmails")
      .set({ email, updated_at: new Date().toISOString() })
      .where("id", "=", id)
      .compile(),
  );
}

export async function deleteBlockedEmail(id: string): Promise<void> {
  await typedExecute(db.deleteFrom("BlockedCustomerEmails").where("id", "=", id).compile());
}
