import type { CompiledQuery } from "kysely";
import { db } from "@/components/providers/SystemProvider";
import type { ActionType } from "./logEventChanges";

/**
 * The one place that builds the insert of a Log row (`EventChangeLog`)
 * (docs/specs/event-change-log-01-payment-recorded.md §3, R6).
 *
 * It only builds the statement. The caller decides how it travels: alone through `typedExecute`, or
 * as one statement of a `typedExecuteBatch`. The second is the one to prefer for a change that has a
 * row: the upload connector discards a whole transaction it is refused, so a row written in a
 * transaction of its own would stay without its change, or the reverse
 * (see `editManualPayment.ts`).
 *
 * The inserts that were built by hand before this file (payment edit and delete, `is_qbo`, send)
 * are not moved to it.
 */

export type EventLogRow = {
  eventId: string;
  changedByUserUuid: string | null;
  fieldName: string;
  prevValue: string | null;
  nextValue: string | null;
  actionType: ActionType | `client_${string}`;
  /** ISO; defaults to now. */
  changedAt?: string;
};

/** The compiled insert of one Log row, for `typedExecute` or `typedExecuteBatch`. */
export function eventLogInsert(row: EventLogRow): CompiledQuery<unknown> {
  return db
    .insertInto("EventChangeLog")
    .values({
      // Generated here, as with every local insert, so a retried upload upserts the same row.
      id: crypto.randomUUID(),
      event_uuid: row.eventId,
      changed_by_user_uuid: row.changedByUserUuid,
      field_name: row.fieldName,
      prev_value: row.prevValue,
      next_value: row.nextValue,
      action_type: row.actionType,
      changed_at: row.changedAt ?? new Date().toISOString(),
    })
    .compile();
}
