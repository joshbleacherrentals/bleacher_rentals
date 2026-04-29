"use client";

import { useRef, useState } from "react";
import { Loader2, Paperclip, Upload, X } from "lucide-react";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useAttachments } from "../hooks/useAttachments";
import {
  deleteAttachment,
  getPublicUrl,
  uploadAttachment,
} from "../db/attachments";
import type { AttachmentParentType } from "../types";

type Props = {
  parentType: AttachmentParentType;
  parentId: string | null;
  uploadedByUserUuid: string | null;
  disabled?: boolean;
};

function formatBytes(bytes: number | null) {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentList({
  parentType,
  parentId,
  uploadedByUserUuid,
  disabled,
}: Props) {
  const supabase = useClerkSupabaseClient();
  const { attachments } = useAttachments(parentType, parentId);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !parentId) return;

    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment({
          supabase,
          parentType,
          parentId,
          file,
          uploadedByUserUuid,
        });
      }
    } catch (err: any) {
      createErrorToast(["Upload failed", err.message ?? String(err)]);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async (id: string, storagePath: string, bucket: string) => {
    try {
      await deleteAttachment({
        supabase,
        attachmentId: id,
        storageBucket: bucket,
        storagePath,
      });
    } catch (err: any) {
      createErrorToast(["Remove failed", err.message ?? String(err)]);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
          <Paperclip className="size-3" /> Attachments
        </span>
        {!disabled && parentId && (
          <label className="cursor-pointer text-xs text-darkBlue hover:underline flex items-center gap-1">
            {busy ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Uploading...
              </>
            ) : (
              <>
                <Upload className="size-3" /> Add files
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
        )}
      </div>

      {attachments.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No attachments yet.</p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between border rounded px-2 py-1 text-sm bg-gray-50"
            >
              <a
                href={getPublicUrl(supabase, a.storage_path)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline truncate flex-1 mr-2"
                title={a.file_name}
              >
                {a.file_name}
              </a>
              <span className="text-xs text-gray-500 mr-2">
                {formatBytes(a.file_size_bytes)}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(a.id, a.storage_path, a.storage_bucket)}
                  className="text-red-500 hover:text-red-700 cursor-pointer"
                  aria-label="Remove"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
