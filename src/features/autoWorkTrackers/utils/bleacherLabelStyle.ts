/**
 * The look of a bleacher's label cell, copied from the Pixi dashboard (BleacherCell.ts) so this grid
 * reads the same. Kept apart from the React so the rules can be tested.
 */

const ROW_COLORS: Record<number, [number, number, number]> = {
  7: [0x15, 0x80, 0x3d], // green-700
  10: [0xb9, 0x1c, 0x1c], // red-700
  15: [0xea, 0xb3, 0x08], // yellow-500
};

const hex = (n: number) => n.toString(16).padStart(2, "0");

/**
 * The colour of the bleacher number: green for 7 rows, red for 10, yellow for 15, black otherwise.
 * When the viewer cannot access the bleacher it fades 40% of the way to the colour's grey.
 */
export function bleacherNumberColor(
  rows: number | null | undefined,
  isAccessible: boolean,
): string {
  const [r, g, b] = rows != null && rows in ROW_COLORS ? ROW_COLORS[rows] : [0, 0, 0];
  if (isAccessible) return `#${hex(r)}${hex(g)}${hex(b)}`;

  const amount = 0.4;
  const grey = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  const mix = (c: number) => Math.round(c * (1 - amount) + grey * amount);
  return `#${hex(mix(r))}${hex(mix(g))}${hex(mix(b))}`;
}

/**
 * Whether the dashboard shows this bleacher normally (true) or greyed out (false): an admin sees
 * every bleacher, an account manager the ones in their own zones, and no one else any.
 */
export function isBleacherAccessible(params: {
  isAdmin: boolean;
  isAccountManager: boolean;
  accountManagerZoneIds: string[];
  bleacherZoneUuid: string | null;
}): boolean {
  const { isAdmin, isAccountManager, accountManagerZoneIds, bleacherZoneUuid } = params;
  return (
    isAdmin ||
    (isAccountManager && !!bleacherZoneUuid && accountManagerZoneIds.includes(bleacherZoneUuid))
  );
}
