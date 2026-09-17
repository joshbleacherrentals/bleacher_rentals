/** One `px-4 py-2 text-sm` option: a 20px line plus 8px of padding on each side. */
export const OPTION_ROW_HEIGHT = 36;

/** The list's top and bottom border. */
const LIST_BORDER = 2;

/**
 * How tall Dropdown's list wants to be, for deciding which side of the button it opens on.
 *
 * The real height is only known once the list is on screen, so the first frame would otherwise
 * guess "as tall as allowed" and flip a three-option list above a button that had plenty of room
 * below it. Counting rows gets that first frame right; the measurement replaces it as soon as
 * there is one.
 */
export function estimateListHeight(optionCount: number, measured: number): number {
  if (measured > 0) return measured;
  return optionCount * OPTION_ROW_HEIGHT + LIST_BORDER;
}
