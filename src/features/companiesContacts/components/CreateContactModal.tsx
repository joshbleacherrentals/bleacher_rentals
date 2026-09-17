"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useContactForm, type SavedContact } from "../hooks/useContactForm";
import { ContactFormFields } from "./ContactFormFields";

export type CreatedContact = SavedContact;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Fires after a successful insert, before onClose. Carries the entered values as well as the
   * id: a caller that wants to select the new contact cannot yet find it in a reactive query,
   * which has not re-emitted at this point.
   */
  onCreated?: (contact: CreatedContact) => void;
  /**
   * Extra classes for the dialog panel. Needed when opening from a surface that is not a Radix
   * dialog — WorkTrackerModal paints its own overlay at z-[2000], well above the z-50 this
   * portal defaults to, so the panel needs raising or it renders underneath.
   */
  contentClassName?: string;
  /**
   * Whatever was typed in a search box before hitting "+ Create New Contact" — seeds First/Last
   * Name (split on the first space) so the caller doesn't have to retype it.
   */
  initialQuery?: string;
};

export function CreateContactModal({
  isOpen,
  onClose,
  onCreated,
  contentClassName,
  initialQuery,
}: Props) {
  const form = useContactForm({ contact: null, initialQuery });

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
            <DialogTitle className="text-base font-semibold text-gray-900">New Contact</DialogTitle>
          </DialogHeader>
        </div>

        <div className="px-6 py-4">
          <ContactFormFields form={form} contentClassName={contentClassName} />
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
            {form.saving ? "Saving…" : "Save Contact"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
