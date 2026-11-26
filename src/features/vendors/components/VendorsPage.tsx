"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { EditVendorModal } from "@/features/manageTeam/components/EditVendorModal";
import { useVendors } from "@/features/manageTeam/hooks/useVendors";
import type { VendorOption, VendorRecord } from "@/features/manageTeam/utils/vendorForm";
import { useUserAccess } from "@/features/userAccess/client";
import { canManageVendors } from "@/features/userAccess/logic/canManageVendors";
import {
  INITIAL_VENDOR_LIST_STATE,
  buildVendorRows,
  nextSort,
  type VendorListState,
} from "../utils/vendorListRows";
import { VendorsTable } from "./VendorsTable";
import { VendorsToolbar } from "./VendorsToolbar";

export type VendorsPageViewProps = {
  vendors: readonly VendorRecord[];
  /** Admin, account manager, maintainer and accountant (D5); a viewer sees no Add button. */
  canManage: boolean;
  state: VendorListState;
  onStateChange: (patch: Partial<VendorListState>) => void;
  onAdd: () => void;
  onOpen: (vendor: VendorRecord) => void;
};

/**
 * The page without its state or its window: the header with Add, the toolbar and the table, drawn
 * from a list of vendors and the state of D22. Plain props, so it is tested without React state.
 */
export function VendorsPageView({
  vendors,
  canManage,
  state,
  onStateChange,
  onAdd,
  onOpen,
}: VendorsPageViewProps) {
  const rows = useMemo(() => buildVendorRows(vendors, state), [vendors, state]);

  return (
    <div>
      <PageHeader
        title="Vendors"
        action={
          canManage ? (
            <Button onClick={onAdd} className="bg-greenAccent hover:bg-greenAccent/90">
              <Plus className="size-4" aria-hidden="true" />
              Add vendor
            </Button>
          ) : undefined
        }
      />
      <VendorsToolbar
        search={state.search}
        type={state.type}
        statuses={state.statuses}
        showDeleted={state.showDeleted}
        onSearchChange={(search) => onStateChange({ search })}
        onTypeChange={(type) => onStateChange({ type })}
        onStatusesChange={(statuses) => onStateChange({ statuses })}
        onShowDeletedChange={(showDeleted) => onStateChange({ showDeleted })}
      />
      <VendorsTable
        rows={rows}
        sort={state.sort}
        onSort={(key) => onStateChange({ sort: nextSort(state.sort, key) })}
        onOpen={onOpen}
      />
    </div>
  );
}

/**
 * The Vendors page (docs/specs/vendors-page.md §4.6): every role but a developer opens it. The
 * search, the filters and the sorting live in memory (D22). A click on a row opens the vendor
 * window: editable for the four roles of D5, read-only for a viewer (D16); a deleted vendor opens
 * locked with Restore (D17). The window gets a snapshot of the vendor taken at the click, so a
 * sync that changes the list does not reset a form someone is typing in.
 */
export default function VendorsPage() {
  const access = useUserAccess();
  const roles = access.status === "active" ? access.roles : [];
  const canManage = canManageVendors(roles);

  const { data: vendors } = useVendors(true);
  const [state, setState] = useState<VendorListState>(INITIAL_VENDOR_LIST_STATE);
  const [windowOpen, setWindowOpen] = useState(false);
  const [selected, setSelected] = useState<VendorOption | null>(null);

  const openVendor = (vendor: VendorRecord) => {
    setSelected(vendor as VendorOption);
    setWindowOpen(true);
  };
  const addVendor = () => {
    setSelected(null);
    setWindowOpen(true);
  };

  return (
    <>
      <VendorsPageView
        vendors={vendors}
        canManage={canManage}
        state={state}
        onStateChange={(patch) => setState((s) => ({ ...s, ...patch }))}
        onAdd={addVendor}
        onOpen={openVendor}
      />
      <EditVendorModal
        isOpen={windowOpen}
        onClose={() => setWindowOpen(false)}
        existingVendor={selected}
        readOnly={!canManage}
      />
    </>
  );
}
