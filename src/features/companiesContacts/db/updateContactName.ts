import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/**
 * Renames a contact and touches nothing else. The inline name editor uses this instead of
 * updateContact so a rename can never rewrite the email, company, language or default venue.
 */
export async function updateContactName(
  id: string,
  firstName: string,
  lastName: string,
): Promise<void> {
  await typedExecute(
    db
      .updateTable("Contacts")
      .set({ first_name: firstName.trim(), last_name: lastName.trim() || null })
      .where("id", "=", id)
      .compile(),
  );
}
