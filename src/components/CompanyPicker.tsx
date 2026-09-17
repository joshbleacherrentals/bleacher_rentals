"use client";

import { useState } from "react";
import { EntitySearchSelect } from "./EntitySearchSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { FIELD_LABEL } from "./form/TextField";
import { CompanyFormFields } from "@/features/companiesContacts/components/CompanyFormFields";
import { useCompanyForm } from "@/features/companiesContacts/hooks/useCompanyForm";
import {
  useCompaniesAll,
  type CompanyFull,
} from "@/features/companiesContacts/hooks/useCompaniesAll";
import { addressDisplayLine } from "@/features/companiesContacts/logic/address";
import { companySearchText } from "@/features/companiesContacts/utils/searchFilter";
import { cn } from "@/lib/utils";

type CompanyPickerProps = {
  companyId: string | null;
  onSelect: (companyId: string) => void;
  onClear: () => void;
  label?: string;
  required?: boolean;
  className?: string;
  /**
   * Extra classes for the create/edit dialog panels — needed when this picker sits on a surface
   * that is not a Radix dialog and paints its own overlay above z-50.
   */
  contentClassName?: string;
};

/** Billing address, or the email/phone, so a row says something beyond the name. */
function companySecondaryLine(company: CompanyFull): string {
  const address = addressDisplayLine(company.billingAddress);
  return address || [company.email, company.phone].filter(Boolean).join(" · ");
}

/**
 * Search-existing / create-new / edit-in-place company picker — the same EntitySearchSelect shell
 * VenuePicker and ContactPicker use. Creating and editing both render the shared company form
 * (see docs/specs/companies-contacts-forms.md), so a company gets the same fields, duplicate
 * checks and address handling wherever it is reached from.
 */
export function CompanyPicker({
  companyId,
  onSelect,
  onClear,
  label = "Company",
  required,
  className,
  contentClassName,
}: CompanyPickerProps) {
  const { companies } = useCompaniesAll();
  const selected = companies.find((c) => c.id === companyId) ?? null;

  const [createOpen, setCreateOpen] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);

  // The company being edited — reachable from any dropdown row, not only the current selection.
  const editingCompany = companies.find((c) => c.id === editingCompanyId) ?? null;
  const createForm = useCompanyForm(null);
  const editForm = useCompanyForm(editingCompany);

  const closeCreate = () => {
    createForm.reset();
    setCreateOpen(false);
  };

  const handleCreate = async () => {
    const saved = await createForm.submit();
    if (!saved) return;
    onSelect(saved.id);
    closeCreate();
  };

  const handleEditSave = async () => {
    const saved = await editForm.submit();
    if (!saved) return;
    // Editing a company always selects it, whether reached from the current selection's own
    // pencil or from a dropdown row — the same contract VenuePicker's pencil flow has.
    onSelect(saved.id);
    setEditingCompanyId(null);
  };

  return (
    <div className={className}>
      {label && (
        <label className={FIELD_LABEL}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}

      <EntitySearchSelect<CompanyFull>
        items={companies}
        selected={selected}
        onSelect={(company) => onSelect(company.id)}
        onClear={onClear}
        onCreateNew={() => setCreateOpen(true)}
        onEdit={setEditingCompanyId}
        renderPrimary={(company) => company.companyName}
        renderSecondary={companySecondaryLine}
        getSearchText={companySearchText}
        createLabel="+ Create New Company"
        emptyLabel="No companies found."
        emptyCardLabel="Select company..."
        placeholder="Search companies..."
      />

      {/* New Company */}
      <Dialog open={createOpen} onOpenChange={(open) => !open && closeCreate()}>
        <DialogContent className={cn("sm:max-w-md max-h-[85vh] overflow-y-auto", contentClassName)}>
          <DialogHeader>
            <DialogTitle>New Company</DialogTitle>
          </DialogHeader>
          <CompanyFormFields form={createForm} />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeCreate}
              className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!createForm.canSave}
              className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue disabled:opacity-40"
            >
              {createForm.saving ? "Saving…" : "Save & Select"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Company */}
      <Dialog open={!!editingCompanyId} onOpenChange={(open) => !open && setEditingCompanyId(null)}>
        <DialogContent className={cn("sm:max-w-md max-h-[85vh] overflow-y-auto", contentClassName)}>
          <DialogHeader>
            <DialogTitle>Edit Company</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-gray-500">
            This updates the company everywhere it&apos;s used, including other quotes.
          </p>
          <CompanyFormFields form={editForm} />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setEditingCompanyId(null)}
              className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleEditSave}
              disabled={!editForm.canSave}
              className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue disabled:opacity-40"
            >
              {editForm.saving ? "Saving…" : "Save Company"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
