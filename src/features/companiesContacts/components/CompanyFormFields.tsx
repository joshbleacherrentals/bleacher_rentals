"use client";

import { TextAreaField, TextField } from "@/components/form/TextField";
import type { CompanyForm } from "../hooks/useCompanyForm";
import { AddressSection } from "./AddressSection";
import { DuplicateWarning } from "./DuplicateWarning";

/** The company form body, shared by New Company and the detail modal's edit mode. */
export function CompanyFormFields({ form }: { form: CompanyForm }) {
  const { state } = form;

  return (
    <div className="space-y-3">
      <TextField
        label="Company Name"
        required
        value={state.values.companyName}
        onChange={form.setValue("companyName")}
        onBlur={() => form.markTouched("companyName")}
        error={form.errorFor("companyName")}
        placeholder="Live Nation Entertainment"
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Email"
          type="email"
          value={state.values.email}
          onChange={form.setValue("email")}
          onBlur={() => form.markTouched("email")}
          error={form.errorFor("email")}
          placeholder="info@company.com"
        />
        <TextField
          label="Phone"
          type="tel"
          value={state.values.phone}
          onChange={form.setValue("phone")}
          onBlur={() => form.markTouched("phone")}
          error={form.errorFor("phone")}
          placeholder="+1 (310) 867-7000"
        />
      </div>

      <DuplicateWarning matches={form.blockingDuplicates} kind="company" severity="block" />
      <DuplicateWarning matches={form.nameOnlyDuplicates} kind="company" severity="warn" />

      <AddressSection label="Billing Address" value={state.billing} onChange={form.setBilling} />

      <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={state.sameAsBilling}
          onChange={(e) => form.setSameAsBilling(e.target.checked)}
          className="rounded"
        />
        Shipping same as billing
      </label>

      {!state.sameAsBilling && (
        <AddressSection
          label="Shipping Address"
          value={state.shipping}
          onChange={form.setShipping}
        />
      )}

      <TextAreaField
        label="Notes"
        value={state.notes}
        onChange={form.setNotes}
        placeholder="VIP client..."
      />
    </div>
  );
}
