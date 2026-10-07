"use client";

import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { describeDocumentFile, describeDocumentStatus } from "../../logic/driverDocuments";
import type { DocumentStatusTone } from "../../logic/driverDocuments";
import { useState } from "react";
import { FileText, ImageUp, Loader2, Paperclip, RefreshCw, X } from "lucide-react";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
];

const TONE_CLASSES: Record<DocumentStatusTone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

export type DriverDocumentCardProps = {
  label: string;
  hint: string;
  bucket: string;
  /** Object key prefix inside the bucket, e.g. "{driverId}/license". */
  storagePath: string;
  value: string | null;
  onChange: (path: string | null) => void;
  /** `YYYY-MM-DD`, or null when unknown. */
  expiresOn: string | null;
  onExpiresOnChange: (value: string | null) => void;
  /** Reference day for the status badge — injected so the badge is testable. */
  todayIso: string;
  disabled?: boolean;
  maxSizeMB?: number;
};

/**
 * One document in Driver Setup: preview, expiry date and upload controls in a
 * single row.
 *
 * The card owns the whole lifecycle of a document — the file in storage *and*
 * the date it stops being valid — because those two are only meaningful
 * together: a licence with no expiry can't be judged, and an expiry with no
 * scan can't be verified. Splitting them across a file input and a separate
 * date field is what made the previous version unreadable at a glance.
 */
export function DriverDocumentCard({
  label,
  hint,
  bucket,
  storagePath,
  value,
  onChange,
  expiresOn,
  onExpiresOnChange,
  todayIso,
  disabled = false,
  maxSizeMB = 5,
}: DriverDocumentCardProps) {
  const supabase = useClerkSupabaseClient();
  const [isUploading, setIsUploading] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const file = describeDocumentFile(value);
  const status = describeDocumentStatus({ path: value, expiresOn, todayIso });
  const publicUrl = value ? supabase.storage.from(bucket).getPublicUrl(value).data.publicUrl : null;
  const showThumbnail = file?.kind === "image" && !thumbnailFailed && publicUrl;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    // Let the same file be picked again after a failed attempt.
    e.target.value = "";

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      createErrorToast(["Invalid file type", "Upload an image (JPG, PNG, HEIC, WebP) or a PDF."]);
      return;
    }
    if (selected.size / (1024 * 1024) > maxSizeMB) {
      createErrorToast(["File too large", `Maximum size is ${maxSizeMB}MB`]);
      return;
    }

    setIsUploading(true);
    try {
      const extension = selected.name.split(".").pop();
      const fileName = `${storagePath}_${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from(bucket).upload(fileName, selected, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;

      setThumbnailFailed(false);
      onChange(fileName);
    } catch (error) {
      createErrorToast([
        "Upload failed",
        error instanceof Error ? error.message : "Could not upload file",
      ]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value) return;
    try {
      const { error } = await supabase.storage.from(bucket).remove([value]);
      if (error) throw error;
      setThumbnailFailed(false);
      onChange(null);
    } catch (error) {
      createErrorToast([
        "Remove failed",
        error instanceof Error ? error.message : "Could not remove file",
      ]);
    }
  };

  // A disabled card cannot be changed, but the document can still be opened. The Driver Setup block
  // of a form that is locked for the signed-in role does not take the pointer (the form wrapper's
  // pointer-events-none), which would make the preview and the file name dead links, so the card
  // opts back in; every control that changes something is hidden or disabled below.
  //
  // It is also faded, to say "read-only" — everything but the document itself: the preview and the
  // file name are what the reader came to look at — and when the preview cannot load, or the file is
  // a PDF, the icon that stands in for it. A parent's opacity cannot be undone by a child, so the
  // card sits in no faded wrapper and fades its own parts.
  const fade = disabled ? "opacity-60" : "";

  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-3 transition-colors hover:border-gray-300 ${
        disabled ? "pointer-events-auto" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Preview */}
        {showThumbnail ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 focus:outline-none focus:ring-2 focus:ring-greenAccent rounded-md"
            aria-label={`Open ${label}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={publicUrl}
              alt={label}
              onError={() => setThumbnailFailed(true)}
              className="h-14 w-14 rounded-md border border-gray-200 object-cover"
            />
          </a>
        ) : (
          <div
            className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md text-gray-400 ${
              file ? "border border-gray-200 bg-gray-50" : "border border-dashed border-gray-300"
            } ${file ? "" : fade}`}
            aria-hidden="true"
          >
            {file?.kind === "pdf" ? (
              <>
                <FileText className="h-5 w-5" />
                <span className="text-[10px] font-medium uppercase tracking-wide">PDF</span>
              </>
            ) : file ? (
              <Paperclip className="h-5 w-5" />
            ) : (
              <ImageUp className="h-5 w-5" />
            )}
          </div>
        )}

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${fade}`}>
            <span className="text-sm font-medium text-gray-900">{label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASSES[status.tone]}`}
            >
              {status.label}
            </span>
          </div>

          <p className={`mt-0.5 truncate text-xs text-gray-500 ${file && publicUrl ? "" : fade}`}>
            {file && publicUrl ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-gray-700 hover:underline"
              >
                {file.fileName}
              </a>
            ) : (
              hint
            )}
          </p>

          <div className={`mt-2 flex flex-wrap items-center gap-2 ${fade}`}>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Expires</span>
              <input
                type="date"
                value={expiresOn ?? ""}
                disabled={disabled}
                aria-label={`${label} expiry date`}
                onChange={(e) => onExpiresOnChange(e.target.value || null)}
                className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-greenAccent disabled:bg-gray-50 disabled:text-gray-400"
              />
            </label>

            {!disabled && (
              <div className="ml-auto flex items-center gap-1">
                <label
                  className={`flex cursor-pointer items-center gap-1.5 rounded border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 ${
                    isUploading ? "pointer-events-none opacity-60" : ""
                  }`}
                >
                  {isUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : file ? (
                    <RefreshCw className="h-3.5 w-3.5" />
                  ) : (
                    <ImageUp className="h-3.5 w-3.5" />
                  )}
                  <span>{isUploading ? "Uploading…" : file ? "Replace" : "Upload"}</span>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(",")}
                    onChange={handleFileChange}
                    disabled={isUploading}
                    aria-label={file ? `Replace ${label}` : `Upload ${label}`}
                    className="hidden"
                  />
                </label>

                {file && (
                  <button
                    type="button"
                    onClick={handleRemove}
                    aria-label={`Remove ${label}`}
                    title={`Remove ${label}`}
                    className="rounded border border-transparent p-1.5 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
