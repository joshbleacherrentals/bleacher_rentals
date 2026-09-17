"use client";

import { CompanyPicker } from "@/components/CompanyPicker";
import { Dropdown } from "@/components/DropDown";
import { FIELD_LABEL, TextAreaField, TextField } from "@/components/form/TextField";
import { VenuePicker } from "@/components/VenuePicker";
import type { ContactForm } from "../hooks/useContactForm";
import { PREFERRED_LANGUAGE_OPTIONS, type PreferredLanguage } from "../db/preferredLanguage";
import { DuplicateWarning } from "./DuplicateWarning";

type Props = {
  form: ContactForm;
  /**
   * Extra classes for the nested New Company dialog. Needed when this form is opened from a
   * surface that is not a Radix dialog — WorkTrackerModal paints its own overlay at z-[2000].
   */
  contentClassName?: string;
};

/** The contact form body, shared by New Contact, the detail modal's edit mode and ContactPicker. */
export function ContactFormFields({ form, contentClassName }: Props) {
  const { state } = form;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="First Name"
          required
          value={state.values.firstName}
          onChange={form.setValue("firstName")}
          onBlur={() => form.markTouched("firstName")}
          error={form.errorFor("firstName")}
          placeholder="Jane"
        />
        <TextField
          label="Last Name"
          value={state.values.lastName}
          onChange={form.setValue("lastName")}
          onBlur={() => form.markTouched("lastName")}
          error={form.errorFor("lastName")}
          placeholder="Smith"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Email"
          type="email"
          value={state.values.email}
          onChange={form.setValue("email")}
          onBlur={() => form.markTouched("email")}
          error={form.errorFor("email")}
          placeholder="jane@company.com"
        />
        <TextField
          label="Phone"
          type="tel"
          value={state.values.phone}
          onChange={form.setValue("phone")}
          onBlur={() => form.markTouched("phone")}
          error={form.errorFor("phone")}
          placeholder="+1 (555) 123-4567"
        />
      </div>

      <DuplicateWarning matches={form.duplicates} kind="contact" severity="block" />

      <div>
        <label className={FIELD_LABEL}>Quote Language</label>
        <Dropdown
          options={PREFERRED_LANGUAGE_OPTIONS}
          selected={state.preferredLanguage}
          onSelect={(value) => form.setPreferredLanguage(value as PreferredLanguage)}
          placeholder="Select language..."
        />
      </div>

      <CompanyPicker
        companyId={state.companyUuid}
        onSelect={form.setCompanyUuid}
        onClear={() => form.setCompanyUuid(null)}
        contentClassName={contentClassName ? "z-[2102]" : undefined}
      />

      <VenuePicker value={state.venue} onChange={form.setVenue} />

      <TextAreaField
        label="Notes"
        value={state.notes}
        onChange={form.setNotes}
        placeholder="Additional notes..."
      />
    </div>
  );
}
