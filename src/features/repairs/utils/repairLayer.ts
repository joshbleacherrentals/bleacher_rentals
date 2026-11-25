/**
 * The layers of the repair windows. A window is opened from the Dashboard and from the card of a damage
 * report, which sit above the default dialog layer (z-50): the cell editor is z-[1000], the card z-[1100]
 * and the photo lightbox of the card z-[1200]. So a repair window, its confirmation dialogs and its
 * overlay are z-[1150], over the card and under the lightbox; windows and dialogs on the same layer lie
 * in the order they were opened (the later one is over the earlier), and the menus that open inside a
 * window are z-[1300], over the window. docs/specs/repairs-11-dashboard.md §11.
 */
export const REPAIR_LAYER_Z = 1150;
export const REPAIR_LAYER_CLASS = "z-[1150]";

export const REPAIR_POPOVER_Z = 1300;
export const REPAIR_POPOVER_CLASS = "z-[1300]";
