import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, typedGetAll } from "@/lib/powersync/typedQuery";

/**
 * Creating, renaming and deleting quote types (the EventTypes rows), written through PowerSync. An
 * admin does it on the Quote Types page; the database lets nobody else write them.
 * Spec: docs/specs/qbo-invoice-12c-manage-quote-types.md
 */

const BLANK_NAME = "Enter a name for the quote type.";

/** What a person is told when a type that quotes or prices use is deleted. */
export const eventTypeInUseMessage = (name: string) =>
  `${name} is used by quotes or prices, so it cannot be deleted.`;

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error(BLANK_NAME);
  return trimmed;
}

/** Adds a quote type and returns its id. A name another type has is accepted. */
export async function createEventType(name: string, createdByUserUuid: string): Promise<string> {
  const cleaned = cleanName(name);
  const id = crypto.randomUUID();
  await typedExecute(
    db
      .insertInto("EventTypes")
      .values({
        id,
        name: cleaned,
        deleted: 0,
        created_at: new Date().toISOString(),
        created_by_user_uuid: createdByUserUuid,
      })
      .compile(),
  );
  return id;
}

export async function renameEventType(id: string, name: string): Promise<void> {
  const cleaned = cleanName(name);
  await typedExecute(
    db.updateTable("EventTypes").set({ name: cleaned }).where("id", "=", id).compile(),
  );
}

/**
 * Whether a quote or a price still points at the type: any Events row (a deleted quote can be
 * restored, so it counts) or any Prices row that is not deleted. It reads this device's data, so it
 * guards the person pressing Delete, not the data: a soft-deleted type breaks no reference.
 */
export async function isEventTypeInUse(id: string): Promise<boolean> {
  const events = await typedGetAll(
    db.selectFrom("Events").select("id").where("event_type_uuid", "=", id).limit(1).compile(),
    expect<{ id: string }>(),
  );
  if (events.length > 0) return true;

  const prices = await typedGetAll(
    db
      .selectFrom("Prices")
      .select("id")
      .where("event_type_uuid", "=", id)
      .where("deleted", "=", 0)
      .limit(1)
      .compile(),
    expect<{ id: string }>(),
  );
  return prices.length > 0;
}

/** Soft-deletes a type nothing uses; never issues a DELETE. `name` is for the message. */
export async function deleteEventType(id: string, name: string): Promise<void> {
  if (await isEventTypeInUse(id)) {
    throw new Error(eventTypeInUseMessage(name));
  }
  await typedExecute(
    db.updateTable("EventTypes").set({ deleted: 1 }).where("id", "=", id).compile(),
  );
}
