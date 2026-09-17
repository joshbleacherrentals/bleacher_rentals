"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { softDeleteContact } from "../db/softDeleteContact";
import { useContactForm } from "../hooks/useContactForm";
import { contactFormSourceOf, type ContactFull } from "../hooks/useContactsAll";
import { PREFERRED_LANGUAGE_OPTIONS } from "../db/preferredLanguage";
import { addressDisplayLine } from "../logic/address";
import { ContactFormFields } from "./ContactFormFields";
import { DetailField } from "./DetailField";

type Props = {
  contact: ContactFull | null;
  onClose: () => void;
};

export function ContactDetailModal({ contact, onClose }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [deleting, setDeleting] = useState(false);

  const form = useContactForm({ contact: contact ? contactFormSourceOf(contact) : null });

  const handleClose = () => {
    setMode("view");
    onClose();
  };

  const handleCancelEdit = () => {
    form.reset();
    setMode("view");
  };

  const handleSave = async () => {
    const saved = await form.submit();
    if (saved) setMode("view");
  };

  const handleDelete = async () => {
    if (!contact) return;
    if (!confirm(`Delete contact "${contact.firstName} ${contact.lastName ?? ""}"?`)) return;
    setDeleting(true);
    try {
      await softDeleteContact(contact.id);
      createSuccessToast(["Contact deleted."]);
      handleClose();
    } catch {
      /* error shown */
    } finally {
      setDeleting(false);
    }
  };

  const languageLabel = PREFERRED_LANGUAGE_OPTIONS.find(
    (o) => o.value === contact?.preferredLanguage,
  )?.label;
  const venue = contact?.defaultVenue;

  return (
    <Dialog open={!!contact} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-0 gap-0 rounded-xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-900">
              {mode === "view"
                ? `${contact?.firstName ?? ""} ${contact?.lastName ?? ""}`.trim()
                : "Edit Contact"}
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {mode === "view" ? (
            <div className="space-y-1">
              <DetailField label="Email" value={contact?.email} />
              <DetailField label="Phone" value={contact?.phone} />
              <DetailField label="Company" value={contact?.company?.companyName} />
              <DetailField label="Language" value={languageLabel} />
              <div className="flex py-2 border-b border-gray-50 last:border-0">
                <span className="w-20 flex-shrink-0 text-[11px] font-semibold text-gray-400 uppercase tracking-wider pt-0.5">
                  Venue
                </span>
                {venue ? (
                  <span className="text-sm text-gray-800">
                    <span className="font-medium">{venue.name}</span>
                    <span className="block text-gray-500">{addressDisplayLine(venue.address)}</span>
                  </span>
                ) : (
                  <span className="text-sm text-gray-300">—</span>
                )}
              </div>
              <DetailField label="Notes" value={contact?.notes} />
            </div>
          ) : (
            <ContactFormFields form={form} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="text-sm font-medium text-red-500 hover:text-red-600 transition-colors disabled:opacity-40 cursor-pointer"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
          <div className="flex items-center gap-2">
            {mode === "view" ? (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => setMode("edit")}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue transition-colors cursor-pointer"
                >
                  Edit
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!form.canSave}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue transition-colors cursor-pointer disabled:opacity-40"
                >
                  {form.saving ? "Saving…" : "Save"}
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
