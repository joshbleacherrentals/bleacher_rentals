"use client";

import { useState } from "react";
import { EditVendorModal } from "@/features/manageTeam/components/EditVendorModal";
import { REPAIR_LAYER_CLASS } from "../utils/repairLayer";
import type { CreatedVendor } from "../utils/repairForm";

/**
 * The "+ Create vendor" row of the Vendor select in the Edit repair and New repair windows
 * (docs/specs/vendors-page.md §11). `openCreate(typed)` opens the vendor window for a new vendor: it
 * starts on Repairs, which can be changed, with `typed` (the text in the select's search) as its
 * Display Name, and lies over the repair window. Save creates the vendor and `onCreated` selects it;
 * the vendor is also kept in `created` so the select can show its name before the live list of
 * vendors has caught up. The window is drawn only while it is open, so each one starts from a clean
 * form. The caller draws `window` anywhere in its tree: the dialog is drawn in a portal.
 */
export function useCreateVendorWindow(onCreated: (vendor: CreatedVendor) => void) {
  const [opened, setOpened] = useState<{ name: string } | null>(null);
  const [created, setCreated] = useState<CreatedVendor | null>(null);

  const window = opened ? (
    <EditVendorModal
      isOpen
      onClose={() => setOpened(null)}
      defaultType="repairs"
      initialName={opened.name}
      layerClassName={REPAIR_LAYER_CLASS}
      onCreated={(vendor) => {
        const made = { id: vendor.id, displayName: vendor.displayName };
        setCreated(made);
        onCreated(made);
      }}
    />
  ) : null;

  return { openCreate: (typedName: string) => setOpened({ name: typedName }), window, created };
}
