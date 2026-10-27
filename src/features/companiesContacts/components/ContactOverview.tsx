"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import { ClampedText } from "@/components/ClampedText";
import { CopyTextButton } from "@/components/CopyTextButton";
import { useContactForm } from "../hooks/useContactForm";
import { contactFormSourceOf, useContactsAll } from "../hooks/useContactsAll";
import { PREFERRED_LANGUAGE_OPTIONS, preferredLanguageBadge } from "../db/preferredLanguage";
import { formatPhone } from "../logic/formatPhone";
import { splitLastWord } from "../logic/splitLastWord";
import { ContactFormFields } from "./ContactFormFields";

const EMPTY = <span className="text-gray-300">—</span>;

/** The top of a contact's page: who they are and how to reach them, with an edit form. */
export function ContactOverview({ contactUuid }: { contactUuid: string }) {
  const { contacts, isLoading } = useContactsAll();
  const contact = contacts.find((c) => c.id === contactUuid) ?? null;

  const [mode, setMode] = useState<"view" | "edit">("view");

  const form = useContactForm({ contact: contact ? contactFormSourceOf(contact) : null });

  const handleCancelEdit = () => {
    form.reset();
    setMode("view");
  };

  const handleSave = async () => {
    const saved = await form.submit();
    if (saved) setMode("view");
  };

  if (isLoading) {
    return <p className="text-sm text-gray-400 py-12 text-center">Loading...</p>;
  }

  if (!contact) {
    return <p className="text-sm text-gray-400 py-12 text-center">Contact not found.</p>;
  }

  const languageLabel = PREFERRED_LANGUAGE_OPTIONS.find(
    (o) => o.value === contact.preferredLanguage,
  )?.label;
  const [nameHead, nameTail] = splitLastWord(`${contact.firstName} ${contact.lastName ?? ""}`);

  return (
    <div>
      {mode === "view" ? (
        <div className="relative rounded border border-gray-100 shadow-sm bg-white p-4">
          <div className="absolute top-4 right-4">
            <AppTooltip content="Edit contact">
              <button
                type="button"
                onClick={() => setMode("edit")}
                aria-label="Edit"
                className="cursor-pointer rounded p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-darkBlue"
              >
                <Pencil className="size-4" />
              </button>
            </AppTooltip>
          </div>

          {/* The badge shares a no-wrap span with the last word, so a long name never strands it. */}
          <h1 className="pr-10 text-xl font-bold text-gray-900">
            {nameHead}
            <span className="whitespace-nowrap">
              {nameTail}
              <span
                title={languageLabel}
                className="ml-2 inline-flex items-center gap-1 rounded bg-greenAccent px-1.5 py-0.5 align-middle text-[11px] font-semibold tracking-wide text-white"
              >
                {preferredLanguageBadge(contact.preferredLanguage)}
              </span>
            </span>
          </h1>

          <div className="-mt-1 flex items-center gap-1 text-sm text-gray-600">
            {contact.email ? (
              <>
                <span className="break-all">{contact.email}</span>
                <CopyTextButton text={contact.email} label="email" />
              </>
            ) : (
              EMPTY
            )}
          </div>
          <div className="mt-0 text-sm text-gray-600">
            {contact.phone ? formatPhone(contact.phone) : EMPTY}
          </div>

          <div className="mt-2">
            <div className="mb-0 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Notes
            </div>
            {contact.notes ? (
              <ClampedText text={contact.notes} lines={3} className="text-sm text-gray-700" />
            ) : (
              <span className="text-sm">{EMPTY}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
          <div className="px-6 pt-6">
            <h1 className="text-base font-semibold text-gray-900">Edit Contact</h1>
          </div>

          <div className="px-6 pt-4 pb-4">
            <ContactFormFields form={form} />
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
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
          </div>
        </div>
      )}
    </div>
  );
}
