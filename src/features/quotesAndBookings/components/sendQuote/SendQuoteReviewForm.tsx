"use client";

import { useRef } from "react";
import { Clock, ExternalLink, Monitor, Paperclip, Smartphone, X } from "lucide-react";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmailChipInput, type ContactSuggestion } from "@/components/EmailChipInput";
import type { RecipientFields } from "../../utils/sendQuote";
import { ACCEPTED_TYPES, MAX_SIZE_MB } from "../../utils/eventFileUpload";
import type { AttachmentRow } from "./sendDialogModel";

export const SUBJECT_PLACEHOLDER = "Leave empty to send the template's subject";

export type SendQuoteReviewFormProps = {
  from: string;
  fields: RecipientFields;
  onFieldsChange: (next: RecipientFields) => void;
  suggestions: ContactSuggestion[];
  subject: string;
  onSubjectChange: (value: string) => void;
  attachments: AttachmentRow[];
  onRemoveAttachment: (key: string) => void;
  onAddFiles: (files: File[]) => void;
  /** Why the last picked file was refused, if it was. */
  fileError: string | null;
  /** Set when a Postmark limit is exceeded (D9). Send is disabled while it is. */
  limitMessage: string | null;
  mobileView: boolean;
  onMobileViewChange: (mobile: boolean) => void;
  sendable: boolean;
  onSend: () => void;
  onCancel: () => void;
};

/** The left side of the review dialog: everything the person can change for this one send. */
export function SendQuoteReviewForm(props: SendQuoteReviewFormProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { fields, onFieldsChange, suggestions } = props;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Review before sending</DialogTitle>
        <DialogDescription>
          Check who gets this email and what is attached. The message below is what your customer
          will receive. Nothing is sent until you press Send.
        </DialogDescription>
      </DialogHeader>

      <dl className="text-sm">
        <dt className="text-xs font-semibold text-gray-500">From</dt>
        <dd className="break-all">{props.from}</dd>
      </dl>

      <EmailChipInput
        label="To"
        field="to"
        fields={fields}
        onFieldsChange={onFieldsChange}
        suggestions={suggestions}
      />
      <EmailChipInput
        label="Cc"
        field="cc"
        fields={fields}
        onFieldsChange={onFieldsChange}
        suggestions={suggestions}
      />
      <EmailChipInput
        label="Bcc"
        field="bcc"
        fields={fields}
        onFieldsChange={onFieldsChange}
        suggestions={suggestions}
      />

      <div>
        <label htmlFor="send-subject" className="mb-1 block text-xs font-semibold text-gray-500">
          Subject
        </label>
        <input
          id="send-subject"
          type="text"
          value={props.subject}
          placeholder={SUBJECT_PLACEHOLDER}
          onChange={(e) => props.onSubjectChange(e.target.value)}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-lightBlue focus:outline-none"
        />
      </div>

      <div className="flex gap-1">
        {(
          [
            { mobile: false, label: "Desktop", Icon: Monitor },
            { mobile: true, label: "Mobile", Icon: Smartphone },
          ] as const
        ).map(({ mobile, label, Icon }) => (
          <button
            key={label}
            type="button"
            aria-pressed={props.mobileView === mobile}
            onClick={() => props.onMobileViewChange(mobile)}
            className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition ${
              props.mobileView === mobile
                ? "border-darkBlue bg-darkBlue text-white"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      <section aria-labelledby="send-attachments-heading">
        <div className="mb-2 flex items-center justify-between">
          <h3
            id="send-attachments-heading"
            className="text-xs font-bold uppercase tracking-wide text-gray-500"
          >
            Attachments ({props.attachments.length})
          </h3>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="cursor-pointer rounded border border-darkBlue px-2 py-1 text-xs font-medium text-darkBlue hover:bg-blue-50"
          >
            Add file
          </button>
          <input
            ref={fileInput}
            type="file"
            data-testid="send-add-file-input"
            className="hidden"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={(e) => {
              if (e.target.files) props.onAddFiles(Array.from(e.target.files));
              e.target.value = "";
            }}
          />
        </div>
        <ul className="flex flex-col gap-2">
          {props.attachments.map((row) => (
            <li
              key={row.key}
              className="flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <Paperclip className="h-4 w-4 shrink-0 text-darkBlue" />
              <div className="min-w-0 flex-1">
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all text-darkBlue hover:underline"
                  >
                    {row.name}
                    <ExternalLink className="ml-1 inline h-3 w-3 text-gray-400" />
                  </a>
                ) : (
                  <span className="break-all">{row.name}</span>
                )}
                {row.pending && (
                  <p className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" /> Waiting — will be uploaded on Send
                  </p>
                )}
                {row.locked && <p className="text-xs text-gray-500">Always attached</p>}
              </div>
              {!row.locked && (
                <button
                  type="button"
                  aria-label={`Remove ${row.name}`}
                  onClick={() => props.onRemoveAttachment(row.key)}
                  className="cursor-pointer rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-gray-400">
          PDF, DOC, XLS, CSV, images — max {MAX_SIZE_MB}MB each
        </p>
        {props.fileError && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {props.fileError}
          </p>
        )}
      </section>

      {props.limitMessage && (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {props.limitMessage}
        </p>
      )}

      <div className="mt-auto flex gap-2 pt-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="flex-1 cursor-pointer rounded-sm border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={props.onSend}
          disabled={!props.sendable}
          className="flex-1 cursor-pointer rounded-sm bg-darkBlue px-4 py-2 text-sm font-semibold text-white hover:bg-lightBlue disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
