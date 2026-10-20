"use client";

import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useState } from "react";
import { Loader2, Upload, X } from "lucide-react";

type FileUploadInputProps = {
  label: string;
  bucket: string;
  /** Object key prefix inside the bucket, e.g. "{driverId}/license" */
  storagePath: string;
  value: string | null;
  onChange: (path: string | null) => void;
  acceptedTypes?: string[];
  maxSizeMB?: number;
};

export function FileUploadInput({
  label,
  bucket,
  storagePath,
  value,
  onChange,
  acceptedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/heic",
    "image/heif",
    "image/webp",
    "application/pdf",
  ],
  maxSizeMB = 5,
}: FileUploadInputProps) {
  const supabase = useClerkSupabaseClient();
  const [isUploading, setIsUploading] = useState(false);

  const getPublicUrl = (path: string) => {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!acceptedTypes.includes(file.type)) {
      createErrorToast(["Invalid file type", `Please upload: ${acceptedTypes.join(", ")}`]);
      return;
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > maxSizeMB) {
      createErrorToast(["File too large", `Maximum size is ${maxSizeMB}MB`]);
      return;
    }

    setIsUploading(true);

    try {
      const timestamp = Date.now();
      const fileExtension = file.name.split(".").pop();
      const fileName = `${storagePath}_${timestamp}.${fileExtension}`;

      const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });

      if (error) throw error;

      onChange(fileName);
      console.log("onChange called with:", fileName);
    } catch (error: any) {
      createErrorToast(["Upload failed", error.message || "Could not upload file"]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!value) return;

    try {
      const { error } = await supabase.storage.from(bucket).remove([value]);
      if (error) throw error;
      onChange(null);
    } catch (error: any) {
      createErrorToast(["Remove failed", error.message || "Could not remove file"]);
    }
  };

  return (
    <div className="min-w-0">
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        {!value ? (
          <label className="flex-1 cursor-pointer">
            <div className="flex items-center gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Choose file...</span>
                </>
              )}
            </div>
            <input
              type="file"
              accept={acceptedTypes.join(",")}
              onChange={handleFileChange}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        ) : (
          <div className="flex min-w-0 flex-1 items-center justify-between rounded border border-green-300 bg-green-50 px-3 py-2 text-sm">
            <a
              href={getPublicUrl(value)}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-green-700 hover:text-green-900 hover:underline cursor-pointer"
            >
              {value.split("/").pop()}
            </a>
            <button
              type="button"
              onClick={handleRemove}
              className="ml-2 shrink-0 text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
