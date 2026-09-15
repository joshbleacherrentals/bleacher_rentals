import { db } from "@/components/providers/SystemProvider";
import { typedExecuteBatch, typedGetAll, expect } from "@/lib/powersync/typedQuery";
import { startTrace } from "@/lib/perf/perfTrace";
import { Database } from "../../../../database.types";

export type WorkTrackerLineItemType = Database["public"]["Enums"]["work_tracker_line_item_type"];

export const WORK_TRACKER_LINE_ITEM_TYPES: WorkTrackerLineItemType[] = [
  "hauling",
  "deadhead",
  "setup",
  "teardown",
  "maintenance",
  "per_diem",
  "custom",
];

export const WORK_TRACKER_LINE_ITEM_TYPE_LABELS: Record<WorkTrackerLineItemType, string> = {
  hauling: "Hauling",
  deadhead: "Deadhead",
  setup: "Setup",
  teardown: "Teardown",
  maintenance: "Maintenance",
  per_diem: "Per Diem",
  custom: "Custom",
};

/**
 * A line item as held in memory while the work tracker modal is open.
 * Not persisted until the work tracker itself is saved — see `syncWorkTrackerLineItems`.
 * `id` is client-generated for new rows (via crypto.randomUUID()) and reused as the
 * row's DB id on insert, same as `savedWorkTrackerUuid` in `saveWorkTracker`.
 */
export type DraftWorkTrackerLineItem = {
  id: string;
  type: WorkTrackerLineItemType;
  /**
   * The line's quantity, one decimal. Backed by `qty_decimal`, not the
   * deprecated integer `quantity` column - a Postgres trigger keeps that one
   * updated for shipped driver-app builds, so nothing here ever writes it.
   */
  qtyDecimal: number;
  unitAmtCents: number;
  description: string | null;
  isAutomaticallyManaged: boolean;
};

/** Returns the sum of every line total, in cents. */
export function calculateWorkTrackerLineItemsTotalCents(items: DraftWorkTrackerLineItem[]): number {
  return items.reduce((sum, item) => sum + Math.round(item.qtyDecimal * item.unitAmtCents), 0);
}

type Row = {
  id: string;
  type: string | null;
  qty_decimal: number | null;
  unit_amt_cents: number | null;
  description: string | null;
  is_automatically_managed: number | null;
};

/**
 * One-time (non-reactive) read of a work tracker's existing line items, used to seed
 * the modal's local draft state when it opens.
 */
export async function fetchWorkTrackerLineItems(
  workTrackerUuid: string,
): Promise<DraftWorkTrackerLineItem[]> {
  const compiled = db
    .selectFrom("WorkTrackerLineItems")
    .select([
      "id",
      "type",
      "qty_decimal",
      "unit_amt_cents",
      "description",
      "is_automatically_managed",
    ])
    .where("work_tracker_uuid", "=", workTrackerUuid)
    .orderBy("created_at", "asc")
    .compile();

  const rows = await typedGetAll(compiled, expect<Row>());

  return rows.map((r) => ({
    id: r.id,
    type: (r.type ?? "custom") as WorkTrackerLineItemType,
    qtyDecimal: r.qty_decimal ?? 0,
    unitAmtCents: r.unit_amt_cents ?? 0,
    description: r.description,
    isAutomaticallyManaged: !!r.is_automatically_managed,
  }));
}

export type WorkTrackerRequirements = {
  setupRequired: boolean;
  teardownRequired: boolean;
  setupCents?: number | null;
  teardownCents?: number | null;
};

/** Keeps requirement-owned lines in sync without touching user-created rows. */
export function reconcileRequirementLineItems(
  items: DraftWorkTrackerLineItem[],
  requirements: WorkTrackerRequirements,
  createId: () => string = () => crypto.randomUUID(),
): DraftWorkTrackerLineItem[] {
  let next = items.filter(
    (item) =>
      !item.isAutomaticallyManaged ||
      (item.type === "setup" && requirements.setupRequired) ||
      (item.type === "teardown" && requirements.teardownRequired),
  );

  for (const [type, required] of [
    ["setup", requirements.setupRequired],
    ["teardown", requirements.teardownRequired],
  ] as const) {
    if (!required) continue;
    const matching = next.filter((item) => item.isAutomaticallyManaged && item.type === type);
    if (matching.length === 0) {
      next = [
        ...next,
        {
          id: createId(),
          type,
          qtyDecimal: 1,
          unitAmtCents:
            (type === "setup" ? requirements.setupCents : requirements.teardownCents) ?? 0,
          description: null,
          isAutomaticallyManaged: true,
        },
      ];
    } else if (matching.length > 1) {
      const keepId = matching[0].id;
      next = next.filter(
        (item) => !item.isAutomaticallyManaged || item.type !== type || item.id === keepId,
      );
    }
  }

  return next;
}

/**
 * Replace a work tracker's stored line items with the given draft set: delete
 * everything currently stored for it, then insert the current list. Called once,
 * as part of saving the work tracker — mirrors `syncPaymentInstallments`.
 */
export async function syncWorkTrackerLineItems(
  workTrackerUuid: string,
  items: DraftWorkTrackerLineItem[],
): Promise<void> {
  const trace = startTrace("syncWorkTrackerLineItems");

  // One transaction, not 1 + N. This is awaited before the modal closes, so it
  // is the only part of a save the user actually waits for — and under
  // IDBBatchAtomicVFS each separate statement was its own IndexedDB round-trip
  // (measured: `delete existing` 639ms, `insert 2 items` 973ms).
  const statements = [
    db
      .deleteFrom("WorkTrackerLineItems")
      .where("work_tracker_uuid", "=", workTrackerUuid)
      .compile(),
    ...items.map((item) =>
      db
        .insertInto("WorkTrackerLineItems")
        .values({
          id: item.id,
          created_at: new Date().toISOString(),
          work_tracker_uuid: workTrackerUuid,
          type: item.type,
          qty_decimal: item.qtyDecimal,
          unit_amt_cents: item.unitAmtCents,
          description: item.description,
          is_automatically_managed: item.isAutomaticallyManaged ? 1 : 0,
        })
        .compile(),
    ),
  ];
  trace.mark(`plan ${items.length} items`);

  await typedExecuteBatch(statements);
  trace.mark(`commit (${statements.length} statements)`);

  trace.end({ workTrackerUuid });
}
