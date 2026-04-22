"use client";

import React, { useState } from "react";
import { Trash2, Plus, Loader2, FileText } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useMaintenanceEventStore } from "../../state/useMaintenanceEventStore";
import { Textarea } from "@/components/TextArea";
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

const BUCKET = "maintenance-photos";
const IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];
const ACCEPTED_TYPES = [
  ...IMAGE_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];
const MAX_SIZE_MB = 10;

const isImagePath = (path: string) => {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ["jpg", "jpeg", "png", "heic", "heif", "webp"].includes(ext);
};

type FileRecord = {
  id: string;
  photo_path: string;
  created_at: string;
};

export const MaintenanceFilesTab = () => {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const store = useMaintenanceEventStore();
  const maintenanceEventUuid = store.maintenanceEventUuid;

  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const queryKey = ["maintenance-photos", maintenanceEventUuid];

  const { data: files = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!maintenanceEventUuid) return [];
      const { data, error } = await supabase
        .from("MaintenancePhotos")
        .select("id, photo_path, created_at")
        .eq("maintenance_event_uuid", maintenanceEventUuid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FileRecord[];
    },
    enabled: !!supabase && !!maintenanceEventUuid,
  });

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !maintenanceEventUuid) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      createErrorToast(["Invalid file type", `Please upload: ${ACCEPTED_TYPES.join(", ")}`]);
      return;
    }
    if (file.size / (1024 * 1024) > MAX_SIZE_MB) {
      createErrorToast(["File too large", `Maximum size is ${MAX_SIZE_MB}MB`]);
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const storagePath = `${maintenanceEventUuid}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("MaintenancePhotos").insert({
        maintenance_event_uuid: maintenanceEventUuid,
        photo_path: storagePath,
      });
      if (insertError) throw insertError;

      queryClient.invalidateQueries({ queryKey });
    } catch (err: any) {
      createErrorToast(["Upload failed", err?.message ?? ""]);
    } finally {
      setUploading(false);
      // Reset file input
      e.target.value = "";
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // Delete from storage
      await supabase.storage.from(BUCKET).remove([deleteTarget.photo_path]);
      // Delete DB row
      const { error } = await supabase.from("MaintenancePhotos").delete().eq("id", deleteTarget.id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey });
    } catch (err: any) {
      createErrorToast(["Delete failed", err?.message ?? ""]);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (!maintenanceEventUuid) {
    return (
      <p className="text-sm text-gray-400 italic py-4">
        Save the maintenance event first, then you can add files.
      </p>
    );
  }

  return (
    <>
      <div className="py-2 grid grid-cols-2 gap-4">
        <div>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {files.map((file) => {
                const url = getPublicUrl(file.photo_path);
                const isImage = isImagePath(file.photo_path);
                const fileName = file.photo_path.split("/").pop() ?? "file";
                return (
                  <div
                    key={file.id}
                    className="relative group w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer"
                    onClick={() => (isImage ? setLightboxUrl(url) : window.open(url, "_blank"))}
                  >
                    {isImage ? (
                      <img
                        src={url}
                        alt="Maintenance photo"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center w-full h-full p-1">
                        <FileText className="h-8 w-8 text-gray-400" />
                        <span className="text-[9px] text-gray-500 mt-1 text-center leading-tight line-clamp-2 break-all">
                          {fileName}
                        </span>
                      </div>
                    )}
                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(file);
                      }}
                      className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}

              {/* Upload button */}
              <label
                className={`flex flex-col items-center justify-center w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 hover:border-darkBlue hover:bg-gray-50 transition cursor-pointer ${
                  uploading ? "opacity-50 pointer-events-none" : ""
                }`}
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                ) : (
                  <>
                    <Plus className="h-5 w-5 text-gray-400" />
                    <span className="text-[10px] text-gray-400 mt-0.5">Add File</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept={ACCEPTED_TYPES.join(",")}
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-black/70 mb-1">Notes</label>
          <Textarea
            className="bg-white"
            placeholder="Describe the maintenance work..."
            value={store.notes}
            onChange={(e) => store.setField("notes", e.target.value)}
          />
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this file from the maintenance event.
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

      {/* Lightbox */}
      <Dialog
        open={!!lightboxUrl}
        onOpenChange={(open) => {
          if (!open) setLightboxUrl(null);
        }}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex items-center justify-center bg-black/90 border-none">
          <VisuallyHidden>
            <DialogTitle>Photo preview</DialogTitle>
          </VisuallyHidden>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Maintenance photo"
              className="max-w-full max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
