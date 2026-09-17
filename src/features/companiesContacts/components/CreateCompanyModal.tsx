"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCompanyForm, type SavedCompany } from "../hooks/useCompanyForm";
import { CompanyFormFields } from "./CompanyFormFields";

export type CreatedCompany = SavedCompany;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Fires after a successful insert, before onClose — see CreateContactModal.onCreated. */
  onCreated?: (company: CreatedCompany) => void;
  /** Extra classes for the dialog panel — used to raise it above non-Radix overlays. */
  contentClassName?: string;
};

export function CreateCompanyModal({ isOpen, onClose, onCreated, contentClassName }: Props) {
  const form = useCompanyForm(null);

  const handleClose = () => {
    form.reset();
    onClose();
  };

  const handleSave = async () => {
    const saved = await form.submit();
    if (!saved) return;
    onCreated?.(saved);
    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className={`sm:max-w-md max-h-[85vh] overflow-y-auto p-0 gap-0 rounded-xl ${contentClassName ?? ""}`}
      >
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-900">New Company</DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 py-4">
          <CompanyFormFields form={form} />
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
          <button
            onClick={handleClose}
            className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!form.canSave}
            className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue transition-colors cursor-pointer disabled:opacity-40"
          >
            {form.saving ? "Saving…" : "Save Company"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
