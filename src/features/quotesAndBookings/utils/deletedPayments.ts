/**
 * What a list does with a soft-deleted payment
 * (docs/specs/accountant-quotes-08-payments-readers-skip-deleted.md).
 *
 * A deleted payment is still a row, and every reader receives it. Whether it COUNTS is decided in
 * one place — `allocatePayments` marks it `excluded: "deleted"`. Whether a list SHOWS it is decided
 * here, so that the list on the Billing tab and the switch that brings deleted rows back (spec 09)
 * cannot disagree about what "deleted" means.
 */

type MaybeDeleted = { deletedAt: string | null };

/** A payment is deleted when it carries a deletion time; an empty string is not a time. */
export function isDeletedPayment(row: MaybeDeleted): boolean {
  return !!row.deletedAt;
}

/** The rows a list shows when it is not showing deleted ones. Order and identity are kept. */
export function withoutDeleted<T extends MaybeDeleted>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isDeletedPayment(row));
}
