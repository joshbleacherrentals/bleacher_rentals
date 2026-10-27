import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import type { PreferredLanguage } from "./preferredLanguage";

// Single-column updates for the inline editors on a contact's page. Like updateContactName, they
// exist so changing one detail can never rewrite the others. A blank value is stored as null.

export async function updateContactEmail(id: string, email: string): Promise<void> {
  await typedExecute(
    db
      .updateTable("Contacts")
      .set({ email: email.trim() || null })
      .where("id", "=", id)
      .compile(),
  );
}

export async function updateContactPhone(id: string, phone: string): Promise<void> {
  await typedExecute(
    db
      .updateTable("Contacts")
      .set({ phone: phone.trim() || null })
      .where("id", "=", id)
      .compile(),
  );
}

export async function updateContactLanguage(
  id: string,
  language: PreferredLanguage,
): Promise<void> {
  await typedExecute(
    db.updateTable("Contacts").set({ preferred_language: language }).where("id", "=", id).compile(),
  );
}

export async function updateContactNotes(id: string, notes: string): Promise<void> {
  await typedExecute(
    db
      .updateTable("Contacts")
      .set({ notes: notes.trim() || null })
      .where("id", "=", id)
      .compile(),
  );
}
