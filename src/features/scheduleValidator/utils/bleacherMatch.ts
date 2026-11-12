export type LineItemRow = {
  bleacherTypeId: string | null;
  bleacherTypeName: string | null;
  quantity: number | null;
};
export type RequiredBleacher = { typeId: string; typeName: string; quantity: number };
/** A bleacher picked for an event; its type is null when the bleacher has none set. */
export type PickedBleacher = { typeId: string | null };

/**
 * What an event asked for: the quantity of each bleacher type, added up over its line items. A line
 * item with no quantity counts as one; one with no bleacher type (a fee, say) is not a bleacher.
 */
export function requiredBleachersByType(rows: LineItemRow[]): RequiredBleacher[] {
  const totals = new Map<string, RequiredBleacher>();
  for (const row of rows) {
    if (!row.bleacherTypeId) continue;
    const total = totals.get(row.bleacherTypeId) ?? {
      typeId: row.bleacherTypeId,
      typeName: row.bleacherTypeName ?? "Unnamed type",
      quantity: 0,
    };
    total.quantity += row.quantity ?? 1;
    totals.set(row.bleacherTypeId, total);
  }
  return [...totals.values()].sort((a, b) =>
    a.typeName.localeCompare(b.typeName, undefined, { numeric: true }),
  );
}

/**
 * True when the bleachers picked are exactly what was required: for every bleacher type the same
 * number picked as required, and nothing picked of a type that was not required. A picked bleacher
 * with no type can never match. An event that requires nothing and has nothing picked matches.
 */
export function bleachersMatch(required: RequiredBleacher[], picked: PickedBleacher[]): boolean {
  const counts = new Map<string, number>();
  for (const bleacher of picked) {
    if (!bleacher.typeId) return false;
    counts.set(bleacher.typeId, (counts.get(bleacher.typeId) ?? 0) + 1);
  }
  if (counts.size !== required.length) return false;
  return required.every((r) => counts.get(r.typeId) === r.quantity);
}
