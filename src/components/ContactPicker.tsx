"use client";

import { useState } from "react";
import { EntitySearchSelect } from "./EntitySearchSelect";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { FIELD_LABEL } from "./form/TextField";
import {
  CreateContactModal,
  type CreatedContact,
} from "@/features/companiesContacts/components/CreateContactModal";
import { ContactFormFields } from "@/features/companiesContacts/components/ContactFormFields";
import { useContactForm } from "@/features/companiesContacts/hooks/useContactForm";
import { softDeleteContact } from "@/features/companiesContacts/db/softDeleteContact";
import { createSuccessToast } from "./toasts/SuccessToast";
import type { ContactOption } from "@/features/companiesContacts/hooks/useContacts";
import { cn } from "@/lib/utils";

export function contactDisplayName(contact: { firstName: string; lastName: string | null }) {
  return `${contact.firstName} ${contact.lastName ?? ""}`.trim();
}

function contactSecondaryLine(contact: ContactOption): string {
  return [contact.email, contact.phone].filter(Boolean).join(" · ");
}

type ContactPickerProps = {
  contactId: string | null;
  contacts: ContactOption[];
  /** Fires on picking an existing contact, or after an edit (which also selects — same
   * contract as VenuePicker's pencil-from-dropdown flow). */
  onSelect: (contact: ContactOption) => void;
  onClear: () => void;
  label?: string;
  required?: boolean;
  className?: string;
  placeholder?: string;
  /**
   * Shown in place of the usual card when `contactId` doesn't resolve to a
   * live contact in `contacts` (a legacy free-text value with no linked
   * contact at all, or a contact that's since been soft-deleted) — so the
   * field still shows something instead of reading as empty. No edit
   * pencil (there's no contact record behind it to edit), but Clear still
   * works. Ignored once a real contact resolves.
   */
  fallbackLabel?: string | null;
  /**
   * Extra classes for the Create/Edit dialog panels — needed when this is
   * opened from a surface that isn't a Radix dialog and paints its own
   * overlay above z-50 (e.g. WorkTrackerModal's z-[2000]).
   */
  contentClassName?: string;
};

/**
 * Search-existing / create-new / edit-in-place contact picker — the same
 * EntitySearchSelect shell VenuePicker uses, with contact-shaped cards
 * (name + email · phone) and dialogs wired to the existing Contact db
 * helpers (createContact via the shared CreateContactModal, updateContact,
 * softDeleteContact).
 */
export function ContactPicker({
  contactId,
  contacts,
  onSelect,
  onClear,
  label = "Contact",
  required,
  className,
  // Deliberately vague — "name", "email" or "phone" in this text is exactly
  // what tips Chrome's autofill heuristics into treating this as an address
  // field (see EntitySearchSelect's readOnly-until-focus workaround).
  placeholder = "Search contacts...",
  fallbackLabel,
  contentClassName,
}: ContactPickerProps) {
  const selected = contacts.find((c) => c.id === contactId) ?? null;

  const [createOpen, setCreateOpen] = useState(false);
  const [createQuery, setCreateQuery] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  // Confirming a delete is just another view inside this same Dialog, not a
  // second overlay — see VenuePicker for why (a second Radix dialog root
  // repeatedly left the page's scroll lock stuck).
  const [editStep, setEditStep] = useState<"form" | "confirmDelete">("form");
  // The contact being edited — reachable from a dropdown row, not only the
  // current selection, so tracked independently of `contactId`.
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // ContactOption is exactly what the shared form seeds from, so the picker
  // edits through the same form as the Companies & Contacts page — venue and
  // all. See docs/specs/companies-contacts-forms.md.
  const editingContact = contacts.find((c) => c.id === editingContactId) ?? null;
  const form = useContactForm({ contact: editingContact });

  const openCreate = (query: string) => {
    setCreateQuery(query);
    setCreateOpen(true);
  };

  const handleCreated = (contact: CreatedContact) => {
    onSelect({
      id: contact.id,
      firstName: contact.firstName,
      lastName: contact.lastName || null,
      email: contact.email || null,
      phone: contact.phone || null,
      companyUuid: contact.companyUuid,
      defaultVenueId: contact.defaultVenueUuid,
      notes: contact.notes || null,
      preferredLanguage: contact.preferredLanguage,
    });
  };

  const openEdit = (id: string) => {
    if (!contacts.some((c) => c.id === id)) return;
    setEditingContactId(id);
    setEditStep("form");
    setEditOpen(true);
  };

  const commitContactEdit = async () => {
    const saved = await form.submit();
    if (!saved) return;
    // Editing a contact always selects it, whether reached from the
    // current selection's own pencil or from a dropdown row.
    onSelect({
      id: saved.id,
      firstName: saved.firstName,
      lastName: saved.lastName || null,
      email: saved.email || null,
      phone: saved.phone || null,
      companyUuid: saved.companyUuid,
      defaultVenueId: saved.defaultVenueUuid,
      notes: saved.notes || null,
      preferredLanguage: saved.preferredLanguage,
    });
    setEditOpen(false);
  };

  const commitDeleteContact = async () => {
    if (!editingContactId) return;
    setDeleteSaving(true);
    try {
      await softDeleteContact(editingContactId);
      createSuccessToast(["Contact deleted."]);
      // Only clear the current selection if the contact just deleted is the
      // one actually selected — deleting some other contact reached from
      // the dropdown shouldn't touch what this field currently has picked.
      if (contactId === editingContactId) onClear();
      setEditOpen(false);
    } catch {
      /* error toast shown */
    } finally {
      setDeleteSaving(false);
    }
  };

  return (
    <div className={className}>
      {label && (
        <label className={FIELD_LABEL}>
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
      )}

      <EntitySearchSelect<ContactOption>
        items={contacts}
        selected={selected}
        onSelect={onSelect}
        onClear={onClear}
        onCreateNew={openCreate}
        onEdit={openEdit}
        renderPrimary={contactDisplayName}
        renderSecondary={contactSecondaryLine}
        getSearchText={(c) => `${contactDisplayName(c)} ${contactSecondaryLine(c)}`}
        createLabel="+ Create New Contact"
        emptyLabel="No contacts found."
        emptyCardLabel={`Select ${label ? label.toLowerCase() : "contact"}...`}
        fallbackLabel={fallbackLabel}
        placeholder={placeholder}
      />

      <CreateContactModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(contact) => {
          handleCreated(contact);
          setCreateOpen(false);
        }}
        initialQuery={createQuery}
        contentClassName={contentClassName}
      />

      {/* Edit Contact — confirming a delete is just another view inside
          this same Dialog, not a second overlay. */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={cn("sm:max-w-md max-h-[85vh] overflow-y-auto", contentClassName)}>
          {editStep === "form" && (
            <>
              <DialogHeader>
                <DialogTitle>Edit Contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  This updates the contact everywhere it's used, including other quotes.
                </p>
                <ContactFormFields form={form} contentClassName={contentClassName} />
              </div>
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setEditStep("confirmDelete")}
                  disabled={form.saving || deleteSaving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md disabled:opacity-40"
                >
                  Delete Contact
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={commitContactEdit}
                    disabled={!form.canSave}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-darkBlue rounded-md hover:bg-lightBlue disabled:opacity-40"
                  >
                    {form.saving ? "Saving…" : "Save Contact"}
                  </button>
                </div>
              </div>
            </>
          )}

          {editStep === "confirmDelete" && (
            <>
              <DialogHeader>
                <DialogTitle>Delete this contact?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-gray-600">
                It won't be findable or pickable for any quote again.
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditStep("form")}
                  className="px-4 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitDeleteContact}
                  disabled={deleteSaving}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-40"
                >
                  {deleteSaving ? "Deleting…" : "Delete Contact"}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
