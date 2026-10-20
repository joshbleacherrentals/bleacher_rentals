"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Upload,
  Trash2,
  Loader2,
  FileText,
  Download,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useAuth } from "@clerk/nextjs";
import { createErrorToast } from "@/components/toasts/ErrorToast";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import {
  ACCEPTED_TYPES,
  EVENT_FILES_BUCKET,
  IMAGE_TYPES,
  MAX_SIZE_MB,
  fileRefusal,
  uploadEventFile,
} from "../../../utils/eventFileUpload";

const BUCKET = EVENT_FILES_BUCKET;

const isImageType = (mime: string | null) =>
  !!mime && IMAGE_TYPES.includes(mime);

const isImagePath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "heic", "heif", "webp"].includes(ext);
};

const formatBytes = (bytes: number | null) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sourceLabel = (source: string | null) => {
  switch (source) {
    case "sent_quote":
      return "Sent Quote PDF";
    case "signed_contract":
      return "Signed Contract";
    case "email_attachment":
      return "Email Attachment";
    case "upload":
    default:
      return "Upload";
  }
};

type EventFileRow = {
  id: string;
  event_uuid: string | null;
  file_name: string | null;
  storage_path: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  source: string | null;
  uploaded_by: string | null;
  created_at: string | null;
};

type StagedFile = {
  id: string;
  file: File;
  preview?: string;
};

export function FilesTab({ quoteId }: { quoteId: string }) {
  const supabase = useClerkSupabaseClient();
  const { userId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EventFileRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const compiled = useMemo(
    () =>
      db
        .selectFrom("EventFiles")
        .select([
          "id",
          "event_uuid",
          "file_name",
          "storage_path",
          "mime_type",
          "file_size_bytes",
          "source",
          "uploaded_by",
          "created_at",
        ])
        .where("event_uuid", "=", quoteId)
        .orderBy("created_at", "asc")
        .compile(),
    [quoteId],
  );

  const { data: files, isLoading } = useTypedQuery(compiled, expect<EventFileRow>());

  const getSignedUrl = async (storagePath: string) => {
    let bucket = BUCKET;
    let path = storagePath;
    if (storagePath.startsWith("contracts/")) {
      bucket = "contracts";
      path = storagePath.slice("contracts/".length);
    }
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600);
    if (error) throw error;
    return data.signedUrl;
  };

  const validateFile = (file: File): boolean => {
    const refusal = fileRefusal(file);
    if (!refusal) return true;
    createErrorToast([refusal.title, refusal.detail]);
    return false;
  };

  const addToStaged = useCallback((fileList: FileList | File[]) => {
    const newFiles: StagedFile[] = [];
    for (const file of Array.from(fileList)) {
      if (!validateFile(file)) continue;
      const id = crypto.randomUUID();
      const preview = file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : undefined;
      newFiles.push({ id, file, preview });
    }
    setStaged((prev) => [...prev, ...newFiles]);
  }, []);

  const removeStaged = (id: string) => {
    setStaged((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleSave = async () => {
    if (staged.length === 0) return;
    setSaving(true);
    try {
      for (const item of staged) {
        await uploadEventFile({
          supabase,
          eventId: quoteId,
          file: item.file,
          source: "upload",
          uploadedBy: userId,
        });
      }

      staged.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
      setStaged([]);
    } catch (err: any) {
      createErrorToast(["Upload failed", err?.message ?? ""]);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !deleteTarget.storage_path) return;
    setDeleting(true);
    try {
      let bucket = BUCKET;
      let path = deleteTarget.storage_path;
      if (path.startsWith("contracts/")) {
        bucket = "contracts";
        path = path.slice("contracts/".length);
      }
      await supabase.storage.from(bucket).remove([path]);
      const { error } = await supabase
        .from("EventFiles")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
    } catch (err: any) {
      createErrorToast(["Delete failed", err?.message ?? ""]);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleFileClick = async (file: EventFileRow) => {
    if (!file.storage_path) return;
    try {
      const url = await getSignedUrl(file.storage_path);
      if (isImagePath(file.storage_path) || isImageType(file.mime_type)) {
        setLightboxUrl(url);
      } else {
        window.open(url, "_blank");
      }
    } catch (err: any) {
      createErrorToast(["Failed to open file", err?.message ?? ""]);
    }
  };

  const handleDownload = async (file: EventFileRow) => {
    if (!file.storage_path) return;
    try {
      const url = await getSignedUrl(file.storage_path);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.file_name ?? "file";
      a.click();
    } catch (err: any) {
      createErrorToast(["Download failed", err?.message ?? ""]);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addToStaged(e.dataTransfer.files);
    }
  };

  const fileList = files ?? [];

  return (
    <>
      <div className="space-y-6">
        {/* Upload area */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Project Files
            </h3>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-medium text-darkBlue border border-darkBlue rounded px-2 py-1 hover:bg-blue-50 transition cursor-pointer flex items-center gap-1"
            >
              <Upload className="w-3 h-3" />
              Upload File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={ACCEPTED_TYPES.join(",")}
              multiple
              onChange={(e) => {
                if (e.target.files) addToStaged(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-lg py-8 text-center transition-colors ${
              dragging ? "border-darkBlue bg-blue-50" : "border-gray-300"
            }`}
          >
            <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Drag & drop files here or click Upload File
            </p>
            <p className="text-xs text-gray-400 mt-1">
              PDF, DOC, PNG, JPG, XLS, CSV — max {MAX_SIZE_MB}MB
            </p>
          </div>
        </div>

        {/* Staged files preview */}
        {staged.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Ready to Upload ({staged.length})
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    staged.forEach(
                      (f) => f.preview && URL.revokeObjectURL(f.preview),
                    );
                    setStaged([]);
                  }}
                  className="text-xs font-medium text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-50 transition cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs font-semibold text-white bg-darkBlue rounded px-3 py-1 hover:bg-lightBlue transition cursor-pointer disabled:opacity-50 flex items-center gap-1"
                >
                  {saving ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {staged.map((item) => (
                <div
                  key={item.id}
                  className="relative group w-24 h-24 rounded-lg overflow-hidden border border-blue-200 bg-blue-50"
                >
                  {item.preview ? (
                    <img
                      src={item.preview}
                      alt={item.file.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full h-full p-1">
                      <FileText className="h-8 w-8 text-gray-400" />
                      <span className="text-[9px] text-gray-500 mt-1 text-center leading-tight line-clamp-2 break-all">
                        {item.file.name}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeStaged(item.id)}
                    className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Files table */}
        <div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : fileList.length === 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">File Name</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-400">
                    No files uploaded yet
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2 font-medium">File Name</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Size</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {fileList.map((file) => {
                  const isImg =
                    isImagePath(file.storage_path ?? "") ||
                    isImageType(file.mime_type);
                  return (
                    <tr
                      key={file.id}
                      className="border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="py-2.5">
                        <button
                          onClick={() => handleFileClick(file)}
                          className="flex items-center gap-2 text-darkBlue hover:underline cursor-pointer text-left"
                        >
                          {isImg ? (
                            <ImageIcon className="w-4 h-4 text-gray-400 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
                          )}
                          <span className="truncate max-w-[200px]">
                            {file.file_name}
                          </span>
                        </button>
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {file.mime_type?.split("/").pop()?.toUpperCase() ?? "—"}
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {formatBytes(file.file_size_bytes)}
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {sourceLabel(file.source)}
                      </td>
                      <td className="py-2.5 text-gray-500">
                        {file.created_at
                          ? new Date(file.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDownload(file)}
                            className="p-1 text-gray-400 hover:text-darkBlue transition cursor-pointer"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          {file.source === "upload" && (
                            <button
                              onClick={() => setDeleteTarget(file)}
                              className="p-1 text-gray-400 hover:text-red-600 transition cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
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
              This will permanently delete &quot;{deleteTarget?.file_name}&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="cursor-pointer rounded-sm"
              disabled={deleting}
            >
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

      {/* Lightbox */}
      <Dialog
        open={!!lightboxUrl}
        onOpenChange={(open) => {
          if (!open) setLightboxUrl(null);
        }}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex items-center justify-center bg-black/90 border-none">
          <VisuallyHidden>
            <DialogTitle>File preview</DialogTitle>
          </VisuallyHidden>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Preview"
              className="max-w-full max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
