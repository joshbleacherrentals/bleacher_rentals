"use client";

import { useId, useState } from "react";
import { Check } from "lucide-react";
import { ClampedText } from "@/components/ClampedText";
import { CopyTextButton } from "@/components/CopyTextButton";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContactsAll } from "../hooks/useContactsAll";
import {
  PREFERRED_LANGUAGE_OPTIONS,
  preferredLanguageBadge,
  type PreferredLanguage,
} from "../db/preferredLanguage";
import {
  updateContactEmail,
  updateContactLanguage,
  updateContactNotes,
  updateContactPhone,
} from "../db/updateContactDetails";
import { updateContactName } from "../db/updateContactName";
import { validateContactChannel } from "../logic/contactChannelEdit";
import type { NameParts } from "../logic/contactNameEdit";
import { formatPhone } from "../logic/formatPhone";
import { splitLastWord } from "../logic/splitLastWord";
import { ContactNameEditor } from "./ContactNameEditor";
import { InlineTextEditor } from "./InlineTextEditor";

const empty = (what: string) => <span className="text-gray-400">No {what}</span>;

type Editing =
  | { field: "name"; focus: "first" | "last" }
  | { field: "email" | "phone" | "notes" }
  | null;

/**
 * The top of a contact's page: who they are and how to reach them. Every value edits in place —
 * click it, and Enter / Escape (or the check and X) save or cancel.
 */
export function ContactOverview({ contactUuid }: { contactUuid: string }) {
  const { contacts, isLoading } = useContactsAll();
  const contact = contacts.find((c) => c.id === contactUuid) ?? null;

  // One editor at a time: opening a field replaces (cancels) whichever was open. For the name,
  // `focus` is the input that starts with the caret.
  const [editing, setEditing] = useState<Editing>(null);
  const [nameHover, setNameHover] = useState(false);
  const nameId = useId();

  const nameEdit = editing?.field === "name" ? editing.focus : null;
  const emailEdit = editing?.field === "email";
  const phoneEdit = editing?.field === "phone";
  const notesEdit = editing?.field === "notes";

  const openName = (focus: "first" | "last") => {
    setNameHover(false); // the heading unmounts under the cursor, so mouseleave never fires
    setEditing({ field: "name", focus });
  };
  // Only closes if that field is still the open one, so a save that finishes after the user
  // moved on to another field cannot close the editor they moved to.
  const close = (field: "name" | "email" | "phone" | "notes") =>
    setEditing((current) => (current?.field === field ? null : current));

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

  const handleSaveName = async (parts: NameParts) => {
    try {
      await updateContactName(contact.id, parts.firstName, parts.lastName);
      close("name");
    } catch (error) {
      createErrorToastNoThrow(["Couldn't save the name."]);
      throw error; // keeps the editor open with what was typed
    }
  };

  const saveDetail = async (
    update: (id: string, value: string) => Promise<void>,
    value: string,
    close: () => void,
    what: string,
  ) => {
    try {
      await update(contact.id, value);
      close();
    } catch (error) {
      createErrorToastNoThrow([`Couldn't save the ${what}.`]);
      throw error; // keeps the editor open with what was typed
    }
  };

  const handleLanguage = async (language: PreferredLanguage) => {
    if (language === contact.preferredLanguage) return;
    try {
      await updateContactLanguage(contact.id, language);
    } catch {
      createErrorToastNoThrow(["Couldn't save the language."]);
    }
  };

  return (
    <div>
      <div className="relative rounded border border-gray-200 bg-white p-4">
        {nameEdit ? (
          <ContactNameEditor
            initial={{ firstName: contact.firstName, lastName: contact.lastName ?? "" }}
            focus={nameEdit}
            onSave={handleSaveName}
            onCancel={() => close("name")}
          />
        ) : (
          /* The language badge shares a no-wrap span with the last word, so a long name never
             strands it. aria-labelledby keeps the badge out of the heading's accessible name.
             Clicking either half of the name opens the inline editor; both halves light up
             together so the name reads as one field. */
          <h1
            className="text-xl font-bold text-gray-900"
            aria-labelledby={`${nameId}-head ${nameId}-tail`}
          >
            <span
              id={`${nameId}-head`}
              title="Click to edit name"
              onClick={() => openName("first")}
              onMouseEnter={() => setNameHover(true)}
              onMouseLeave={() => setNameHover(false)}
              className={`cursor-text rounded ${nameHover ? "bg-gray-100" : ""}`}
            >
              {nameHead}
            </span>
            <span className="whitespace-nowrap">
              <span
                id={`${nameId}-tail`}
                title="Click to edit name"
                onClick={() => openName(contact.lastName ? "last" : "first")}
                onMouseEnter={() => setNameHover(true)}
                onMouseLeave={() => setNameHover(false)}
                className={`cursor-text rounded ${nameHover ? "bg-gray-100" : ""}`}
              >
                {nameTail}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title={`${languageLabel} — click to change`}
                    aria-label={`Language: ${languageLabel}. Change`}
                    className="relative -top-px ml-2 inline-flex cursor-pointer items-center rounded bg-greenAccent px-1.5 py-0.5 align-middle text-[11px] font-semibold tracking-wide text-white transition-opacity hover:opacity-90"
                  >
                    {preferredLanguageBadge(contact.preferredLanguage)}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[8rem]">
                  {PREFERRED_LANGUAGE_OPTIONS.map((option) => (
                    <DropdownMenuItem
                      key={option.value}
                      onSelect={() => void handleLanguage(option.value)}
                    >
                      {option.label}
                      {option.value === contact.preferredLanguage && (
                        <Check className="ml-auto size-4" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </h1>
        )}

        {emailEdit ? (
          <div className="mt-1">
            <InlineTextEditor
              initial={contact.email ?? ""}
              label="Email"
              type="email"
              placeholder="name@company.com"
              validate={(value) => validateContactChannel("email", value, contacts, contact.id)}
              onSave={(value) =>
                saveDetail(updateContactEmail, value, () => close("email"), "email")
              }
              onCancel={() => close("email")}
            />
          </div>
        ) : (
          <div className="-mt-1 flex items-center gap-1 text-sm text-gray-600">
            <span
              title="Click to edit email"
              onClick={() => setEditing({ field: "email" })}
              className="-mx-1 cursor-text break-all rounded px-1 hover:bg-gray-100"
            >
              {contact.email || empty("email")}
            </span>
            {contact.email && <CopyTextButton text={contact.email} label="email" />}
          </div>
        )}

        {phoneEdit ? (
          <div className="mt-1">
            <InlineTextEditor
              initial={contact.phone ?? ""}
              label="Phone"
              type="tel"
              placeholder="555-555-5555"
              validate={(value) => validateContactChannel("phone", value, contacts, contact.id)}
              onSave={(value) =>
                saveDetail(updateContactPhone, value, () => close("phone"), "phone number")
              }
              onCancel={() => close("phone")}
            />
          </div>
        ) : (
          <div className="mt-0 text-sm text-gray-600">
            <span
              title="Click to edit phone"
              onClick={() => setEditing({ field: "phone" })}
              className="-mx-1 cursor-text rounded px-1 hover:bg-gray-100"
            >
              {contact.phone ? formatPhone(contact.phone) : empty("phone")}
            </span>
          </div>
        )}

        <div className="mt-2">
          <div
            onClick={() => setEditing({ field: "notes" })}
            className="mb-0 cursor-text text-[11px] font-semibold uppercase tracking-wider text-gray-400"
          >
            Notes
          </div>
          {notesEdit ? (
            <InlineTextEditor
              initial={contact.notes ?? ""}
              label="Notes"
              multiline
              placeholder="Add notes"
              validate={() => null}
              onSave={(value) =>
                saveDetail(updateContactNotes, value, () => close("notes"), "notes")
              }
              onCancel={() => close("notes")}
            />
          ) : contact.notes ? (
            <div className="rounded border border-gray-200 px-2 py-1.5 transition-colors hover:border-gray-300">
              <ClampedText
                text={contact.notes}
                lines={3}
                className="cursor-text text-sm text-gray-700"
                onTextClick={() => setEditing({ field: "notes" })}
                textTitle="Click to edit notes"
              />
            </div>
          ) : (
            <div
              onClick={() => setEditing({ field: "notes" })}
              className="cursor-text rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-400 transition-colors hover:border-gray-300"
            >
              Click to add a note
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
