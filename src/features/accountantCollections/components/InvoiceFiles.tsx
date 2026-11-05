"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileText, Loader2, Paperclip, Trash2, Upload, X } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { db } from "@/components/providers/SystemProvider";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createEventFileUrl,
  removeEventFile,
} from "@/features/quotesAndBookings/utils/eventFileStorage";
import {
  ACCEPTED_TYPES,
  errorMessage,
  fileRefusal,
  uploadEventFile,
} from "@/features/quotesAndBookings/utils/eventFileUpload";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { buildFileRows, type FileRow, type InvoiceFileRow } from "../utils/invoiceFiles";

/**
 * The Files section of Information: the files attached to the quote / invoice, the same rows as
 * the quote card's Files tab, with Download on every file, Delete on the ones attached by hand and
 * an Attach File button that stages the chosen files until Save. The list reads the local table;
 * upload, download and delete go to Supabase Storage, so they work online only.
 * docs/specs/accountant-collections-13-task-history-and-files.md §3.
 */

const TH = "border-b border-gray-200 p-2 font-medium";
const ICON_BUTTON =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40";

export type StagedFile = { id: string; file: File; preview?: string };

/**
 * The files the quote card would take and the reasons it would refuse the others. A refused file
 * does not stop the rest of the batch.
 */
export function splitRefused<T extends { type: string; size: number }>(
  files: readonly T[],
): { accepted: T[]; refused: { title: string; detail: string }[] } {
  const accepted: T[] = [];
  const refused: { title: string; detail: string }[] = [];
  for (const file of files) {
    const refusal = fileRefusal(file);
    if (refusal) refused.push(refusal);
    else accepted.push(file);
  }
  return { accepted, refused };
}

export function StagedFilesList({
  staged,
  saving,
  onRemove,
  onClear,
  onSave,
}: {
  staged: readonly StagedFile[];
  saving: boolean;
  onRemove: (id: string) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  if (staged.length === 0) return null;
  return (
    <div className="mb-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
          Ready to Upload ({staged.length})
        </h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            className="h-8 cursor-pointer rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-darkBlue px-3 text-sm font-semibold text-white hover:bg-darkBlue/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-3.5" aria-hidden />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        {staged.map((item) => (
          <div
            key={item.id}
            className="group relative size-24 overflow-hidden rounded-lg border border-blue-200 bg-blue-50"
          >
            {item.preview ? (
              <img src={item.preview} alt={item.file.name} className="size-full object-cover" />
            ) : (
              <div className="flex size-full flex-col items-center justify-center p-1">
                <FileText className="size-8 text-gray-400" aria-hidden />
                <span className="mt-1 line-clamp-2 break-all text-center text-[9px] leading-tight text-gray-500">
                  {item.file.name}
                </span>
              </div>
            )}
            <button
              type="button"
              aria-label={`Remove ${item.file.name}`}
              onClick={() => onRemove(item.id)}
              className="absolute right-1 top-1 cursor-pointer rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity hover:bg-red-600 focus:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FilesTable({
  rows,
  isLoading,
  onDownload,
  onDelete,
}: {
  rows: readonly FileRow[];
  isLoading: boolean;
  onDownload: (row: FileRow) => void;
  onDelete: (row: FileRow) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500">
            <th scope="col" className={`${TH} w-10 pl-0`}>
              #
            </th>
            <th scope="col" className={TH}>
              File Name
            </th>
            <th scope="col" className={TH}>
              Type
            </th>
            <th scope="col" className={TH}>
              Date
            </th>
            <th scope="col" className={`${TH} w-24 pr-0 text-right`}>
              Action
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-gray-400">
                {isLoading ? (
                  <Loader2 className="mx-auto size-5 animate-spin" aria-label="Loading files" />
                ) : (
                  "No files uploaded yet"
                )}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                <td className="py-2 pr-2 text-gray-500">{row.number}</td>
                <td className="p-2">
                  <span className="block max-w-[320px] truncate" title={row.name}>
                    {row.name || "—"}
                  </span>
                </td>
                <td className="p-2">{row.typeLabel}</td>
                <td className="p-2">{row.dateLabel}</td>
                <td className="py-2 pl-2 text-right">
                  <span className="inline-flex gap-1">
                    <button
                      type="button"
                      aria-label={`Download ${row.name || "file"}`}
                      title="Download"
                      disabled={!row.storagePath}
                      onClick={() => onDownload(row)}
                      className={ICON_BUTTON}
                    >
                      <Download className="size-4" aria-hidden />
                    </button>
                    {row.canDelete && (
                      <button
                        type="button"
                        aria-label={`Delete ${row.name || "file"}`}
                        title="Delete"
                        disabled={!row.storagePath}
                        onClick={() => onDelete(row)}
                        className={`${ICON_BUTTON} text-[#a8403a]`}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export function InvoiceFiles({ eventId, timezone }: { eventId: string; timezone: string }) {
  const supabase = useClerkSupabaseClient();
  const { userId } = useAuth();
  // `Users.id`, for the Log rows of an upload and of a delete. `userId` above is the Clerk id.
  const userUuid = usePermissionsStore((s) => s.userId);
  const inputRef = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FileRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const compiled = useMemo(
    () =>
      db
        .selectFrom("EventFiles")
        .select(["id", "file_name", "storage_path", "source", "created_at"])
        .where("event_uuid", "=", eventId)
        .orderBy("created_at", "asc")
        .compile(),
    [eventId],
  );
  const { data, isLoading } = useTypedQuery(compiled, expect<InvoiceFileRow>());
  const rows = useMemo(() => buildFileRows(data ?? [], timezone), [data, timezone]);

  // The thumbnails are object URLs; let go of the ones still held when the section goes away.
  const stagedRef = useRef(staged);
  stagedRef.current = staged;
  useEffect(
    () => () => {
      for (const item of stagedRef.current) if (item.preview) URL.revokeObjectURL(item.preview);
    },
    [],
  );

  const addToStaged = (files: File[]) => {
    const { accepted, refused } = splitRefused(files);
    for (const { title, detail } of refused) createErrorToastNoThrow([title, detail]);
    setStaged((prev) => [
      ...prev,
      ...accepted.map((file) => ({
        id: crypto.randomUUID(),
        file,
        preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      })),
    ]);
  };

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const removed = prev.find((item) => item.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((item) => item.id !== id);
    });
  };

  const clearStaged = () => {
    for (const item of staged) if (item.preview) URL.revokeObjectURL(item.preview);
    setStaged([]);
  };

  const handleSave = async () => {
    if (staged.length === 0) return;
    setSaving(true);
    try {
      for (const item of staged) {
        await uploadEventFile({
          supabase,
          eventId,
          file: item.file,
          source: "upload",
          uploadedBy: userId,
          changedByUserUuid: userUuid,
        });
        // A file that went up leaves the list, so a retry after a later failure does not send it twice.
        removeStaged(item.id);
      }
    } catch (err) {
      createErrorToastNoThrow(["Upload failed", errorMessage(err)]);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async (row: FileRow) => {
    if (!row.storagePath) return;
    try {
      const url = await createEventFileUrl(supabase, row.storagePath);
      const link = document.createElement("a");
      link.href = url;
      link.download = row.name || "file";
      link.click();
    } catch (err) {
      createErrorToastNoThrow(["Download failed", errorMessage(err)]);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.storagePath) return;
    setDeleting(true);
    try {
      await removeEventFile(
        supabase,
        {
          id: deleteTarget.id,
          storage_path: deleteTarget.storagePath,
          file_name: deleteTarget.name,
        },
        { eventId, changedByUserUuid: userUuid },
      );
    } catch (err) {
      createErrorToastNoThrow(["Delete failed", errorMessage(err)]);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <section aria-label="Files" className="rounded-[10px] border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Files</h3>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-darkBlue bg-white px-3 text-sm font-medium text-darkBlue hover:bg-blue-50"
        >
          <Paperclip className="size-3.5" aria-hidden />
          Attach File
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          onChange={(e) => {
            if (e.target.files) addToStaged(Array.from(e.target.files));
            e.target.value = "";
          }}
        />
      </div>

      <StagedFilesList
        staged={staged}
        saving={saving}
        onRemove={removeStaged}
        onClear={clearStaged}
        onSave={handleSave}
      />

      <FilesTable
        rows={rows}
        isLoading={isLoading}
        onDownload={handleDownload}
        onDelete={setDeleteTarget}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteTarget?.name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer rounded-sm" disabled={deleting}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
