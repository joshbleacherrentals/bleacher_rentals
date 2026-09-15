import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import type { PreferredLanguage } from "./preferredLanguage";

type CreateContactParams = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  companyUuid: string | null;
  // Language used by client-facing quotes for this contact.
  preferredLanguage?: PreferredLanguage;
  defaultVenueUuid?: string | null;
};

export async function createContact(params: CreateContactParams): Promise<string> {
  try {
    const id = crypto.randomUUID();

    await typedExecute(
      db
        .insertInto("Contacts")
        .values({
          id,
          first_name: params.firstName,
          last_name: params.lastName || null,
          phone: params.phone || null,
          email: params.email || null,
          notes: params.notes || null,
          company_uuid: params.companyUuid,
          preferred_language: params.preferredLanguage ?? "english",
          default_venue_uuid: params.defaultVenueUuid ?? null,
          deleted: 0,
        })
        .compile(),
    );

    return id;
  } catch (e) {
    createErrorToast(["Failed to create contact.", e instanceof Error ? e.message : ""]);
    throw e;
  }
}
