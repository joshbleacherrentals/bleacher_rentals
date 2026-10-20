import { db } from "@/components/providers/SystemProvider";
import { typedWriteTransaction } from "@/lib/powersync/typedQuery";
import type { Currency, LineItem } from "../types/quoteTypes";
import { diffLineItems, type ExistingLineItem } from "../utils/diffLineItems";

/**
 * Makes a quote's line items exactly the form's items, through the local database. Spec:
 * docs/specs/quote-detail-04-line-items-local.md.
 *
 * It used to delete every row through Supabase and insert the form's items under new ids, so the
 * rows reached other tabs only after a round trip through the server, a failed call went unseen,
 * and a Save that changed nothing still moved the quote's contract hash twice and invalidated its
 * signature. Now only what differs is written, in one local transaction, and the upload carries
 * it to the server like any other local write.
 *
 * - The read and the writes share one transaction: one commit, one wake-up of the watchers, one
 *   upload transaction. If any statement fails, nothing of it is kept and the error reaches the
 *   caller, so the editor keeps the draft.
 * - An item added in the form is inserted under its own id, so a retry, or a second Save with the
 *   form still open after "Preview", finds its row and writes nothing twice.
 * - A row that is already deleted (`deleted = 1`) is neither read nor touched.
 */
export async function syncEventLineItems(
  eventId: string,
  items: LineItem[],
  currency: Currency,
): Promise<void> {
  await typedWriteTransaction(async (tx) => {
    const read = db
      .selectFrom("EventLineItems")
      .select([
        "id",
        "header",
        "description",
        "bleacher_type_uuid",
        "value_cents",
        "quantity",
        "currency",
        "is_price_overridden",
      ])
      .where("event_uuid", "=", eventId)
      .where("deleted", "=", 0)
      .compile();
    const existing = await tx.getAll<ExistingLineItem>(read.sql, read.parameters as any[]);

    const diff = diffLineItems(existing, items, eventId, currency);

    if (diff.toDelete.length > 0) {
      const remove = db.deleteFrom("EventLineItems").where("id", "in", diff.toDelete).compile();
      await tx.execute(remove.sql, remove.parameters as any[]);
    }

    for (const { id, values } of diff.toUpdate) {
      const update = db
        .updateTable("EventLineItems")
        .set({ ...values, is_price_overridden: values.is_price_overridden ? 1 : 0 })
        .where("id", "=", id)
        .compile();
      await tx.execute(update.sql, update.parameters as any[]);
    }

    // The list is ordered by `created_at`: an empty value would sort first until the server's
    // own value syncs back, so the time the item was added is written with it.
    const addedAt = new Date().toISOString();
    for (const { id, values } of diff.toInsert) {
      const insert = db
        .insertInto("EventLineItems")
        .values({
          id,
          ...values,
          is_price_overridden: values.is_price_overridden ? 1 : 0,
          is_template: 0,
          deleted: 0,
          created_at: addedAt,
        })
        .compile();
      await tx.execute(insert.sql, insert.parameters as any[]);
    }
  });
}
