"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { softDeleteCompany } from "../db/softDeleteCompany";
import { useContactsByCompany } from "../hooks/useContactsByCompany";
import { useCompanyForm } from "../hooks/useCompanyForm";
import type { CompanyFull } from "../hooks/useCompaniesAll";
import { addressDisplayLine } from "../logic/address";
import { isSameAddress } from "../logic/companyForm";
import { CompanyFormFields } from "./CompanyFormFields";
import { DetailField } from "./DetailField";

type Props = {
  company: CompanyFull | null;
  onClose: () => void;
};

/** Shipping reads "Same as billing" rather than repeating the same lines. */
function shippingDisplay(company: CompanyFull | null): string {
  const shipping = company?.shippingAddress;
  if (!shipping) return "";
  const billing = company?.billingAddress;
  return billing && isSameAddress(billing, shipping)
    ? "Same as billing"
    : addressDisplayLine(shipping);
}

export function CompanyDetailModal({ company, onClose }: Props) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [deleting, setDeleting] = useState(false);

  const form = useCompanyForm(company);
  const linkedContacts = useContactsByCompany(company?.id ?? null);

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
    if (!company) return;
    if (!confirm(`Delete company "${company.companyName}"? Linked contacts will not be deleted.`))
      return;
    setDeleting(true);
    try {
      await softDeleteCompany(company.id);
      createSuccessToast(["Company deleted."]);
      handleClose();
    } catch {
      /* error shown */
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={!!company} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-0 gap-0 rounded-xl">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-gray-900">
              {mode === "view" ? (company?.companyName ?? "") : "Edit Company"}
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {mode === "view" ? (
            <div className="space-y-1">
              <DetailField label="Email" value={company?.email} />
              <DetailField label="Phone" value={company?.phone} />
              <DetailField label="Billing" value={addressDisplayLine(company?.billingAddress)} />
              <DetailField label="Shipping" value={shippingDisplay(company)} />
              <DetailField label="Notes" value={company?.notes} />

              <div className="pt-3 mt-3 border-t border-gray-100">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Contacts ({linkedContacts.length})
                </p>
                {linkedContacts.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-1">No contacts linked.</p>
                ) : (
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    {linkedContacts.map((c, i) => (
                      <div
                        key={c.id}
                        className={`flex items-center justify-between px-3 py-2 text-sm ${i !== 0 ? "border-t border-gray-50" : ""}`}
                      >
                        <span className="font-medium text-gray-800">
                          {c.firstName} {c.lastName ?? ""}
                        </span>
                        <span className="text-gray-400 text-xs">{c.email ?? c.phone ?? ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <CompanyFormFields form={form} />
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
