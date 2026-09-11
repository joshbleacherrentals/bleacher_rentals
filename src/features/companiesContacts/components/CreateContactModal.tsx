"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Dropdown } from "@/components/DropDown";
import { FIELD_LABEL, TextAreaField, TextField } from "@/components/form/TextField";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { useTouchedErrors } from "@/lib/validation/useTouchedErrors";
import { useCompaniesAll } from "../hooks/useCompaniesAll";
import { useContactsAll } from "../hooks/useContactsAll";
import { createContact } from "../db/createContact";
import { CreateCompanyModal } from "./CreateCompanyModal";
import { DuplicateWarning } from "./DuplicateWarning";
import { findContactDuplicates } from "../utils/findDuplicates";
import { hasErrors, validateContactForm, type ContactFormValues } from "../utils/formValidation";
import { PREFERRED_LANGUAGE_OPTIONS, type PreferredLanguage } from "../db/preferredLanguage";
import { VenuePicker, type VenuePickerValue } from "@/components/VenuePicker";

export type CreatedContact = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  companyUuid: string | null;
  companyName: string;
};

const CONTACT_FIELDS = ["firstName", "lastName", "email", "phone"] as const;

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
};

export function CreateContactModal({ isOpen, onClose, onCreated, contentClassName }: Props) {
  const { companies, isLoading } = useCompaniesAll();
  const { contacts } = useContactsAll();
  const [createCompanyOpen, setCreateCompanyOpen] = useState(false);
  const [values, setValues] = useState<ContactFormValues>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [companyUuid, setCompanyUuid] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [preferredLanguage, setPreferredLanguage] = useState<PreferredLanguage>("english");
  const [venue, setVenue] = useState<VenuePickerValue>({
    mode: "empty",
    venueId: null,
    address: null,
  });
  const [saving, setSaving] = useState(false);

  const errors = validateContactForm(values);
  const { errorFor, markTouched, markAllTouched, reset: resetTouched } = useTouchedErrors(errors);

  const setValue = (key: keyof ContactFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const reset = () => {
    setValues({ firstName: "", lastName: "", email: "", phone: "" });
    setCompanyUuid(null);
    setNotes("");
    setPreferredLanguage("english");
    setVenue({ mode: "empty", venueId: null, address: null });
    resetTouched();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const companyOptions = companies.map((c) => ({
    label: c.companyName,
    value: c.id,
    searchValue: `${c.email ?? ""} ${c.phone ?? ""} ${c.address}`,
  }));

  const selectedCompanyName = companies.find((c) => c.id === companyUuid)?.companyName ?? "";

  const duplicateContacts = findContactDuplicates(contacts, values);
  const duplicateLabels = duplicateContacts.map(
    (c) => `${c.firstName} ${c.lastName ?? ""}`.trim() + (c.email ? ` (${c.email})` : ""),
  );

  const canSave = !hasErrors(errors) && !saving && duplicateContacts.length === 0;

  const handleSave = async () => {
    markAllTouched(CONTACT_FIELDS);
    if (!canSave) return;

    setSaving(true);
    try {
      const displayName = `${values.firstName} ${values.lastName}`.trim();
      const id = await createContact({
        ...values,
        notes,
        companyUuid,
        preferredLanguage,
        defaultVenueUuid: venue.mode === "venue" ? venue.venueId : null,
      });
      createSuccessToast([`Contact "${displayName}" created.`]);
      onCreated?.({
        id,
        displayName,
        email: values.email,
        phone: values.phone,
        companyUuid,
        companyName: selectedCompanyName,
      });
      handleClose();
    } catch {
      /* error toast shown by createContact */
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className={`sm:max-w-md p-0 gap-0 rounded-xl ${contentClassName ?? ""}`}>
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-gray-900">
                New Contact
              </DialogTitle>
            </DialogHeader>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="First Name"
                required
                value={values.firstName}
                onChange={setValue("firstName")}
                onBlur={() => markTouched("firstName")}
                error={errorFor("firstName")}
                placeholder="Jane"
              />
              <TextField
                label="Last Name"
                value={values.lastName}
                onChange={setValue("lastName")}
                onBlur={() => markTouched("lastName")}
                error={errorFor("lastName")}
                placeholder="Smith"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Email"
                type="email"
                value={values.email}
                onChange={setValue("email")}
                onBlur={() => markTouched("email")}
                error={errorFor("email")}
                placeholder="jane@company.com"
              />
              <TextField
                label="Phone"
                type="tel"
                value={values.phone}
                onChange={setValue("phone")}
                onBlur={() => markTouched("phone")}
                error={errorFor("phone")}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <DuplicateWarning matches={duplicateLabels} kind="contact" severity="block" />

            <div>
              <label className={FIELD_LABEL}>Quote Language</label>
              <Dropdown
                options={PREFERRED_LANGUAGE_OPTIONS}
                selected={preferredLanguage}
                onSelect={(value) => setPreferredLanguage(value as PreferredLanguage)}
                placeholder="Select language..."
              />
            </div>

            <div>
              <label className={FIELD_LABEL}>Company</label>
              <div className="flex gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    options={companyOptions}
                    selected={companyUuid}
                    onSelect={setCompanyUuid}
                    placeholder={isLoading ? "Loading..." : "Select company..."}
                    searchPlaceholder="Search by name, email, phone or address..."
                    emptyMessage="No companies found."
                    disabled={isLoading}
                  />
                </div>
                <button
                  onClick={() => setCreateCompanyOpen(true)}
                  className="h-9 px-3 text-sm font-medium text-darkBlue border border-gray-200 rounded-md hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap bg-gray-50"
                >
                  + New
                </button>
              </div>
            </div>

            <VenuePicker value={venue} onChange={setVenue} />

            <TextAreaField
              label="Notes"
              value={notes}
              onChange={setNotes}
              placeholder="Additional notes..."
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-xl">
            <button
              onClick={handleClose}
              className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!canSave}
              className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue transition-colors cursor-pointer disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Contact"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateCompanyModal
        isOpen={createCompanyOpen}
        onClose={() => setCreateCompanyOpen(false)}
        onCreated={(company) => setCompanyUuid(company.id)}
        contentClassName={contentClassName ? "z-[2102]" : undefined}
      />
    </>
  );
}
