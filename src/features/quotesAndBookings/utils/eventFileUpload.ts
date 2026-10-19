import type { SupabaseClient } from "@supabase/supabase-js";

/** Shared by the Files tab and the send-quote dialog: same bucket, same limits. */
export const EVENT_FILES_BUCKET = "event-files";

export const IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
];

export const ACCEPTED_TYPES = [
  ...IMAGE_TYPES,
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

export const MAX_SIZE_MB = 20;

/** Why the Files tab would refuse a file (a title and a detail), or null when it is fine. */
export function fileRefusal(file: {
  type: string;
  size: number;
}): { title: string; detail: string } | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return { title: "Invalid file type", detail: "Accepted: PDF, DOC, XLS, CSV, images" };
  }
  if (file.size / (1024 * 1024) > MAX_SIZE_MB) {
    return { title: "File too large", detail: `Maximum size is ${MAX_SIZE_MB}MB` };
  }
  return null;
}

/** A readable message from anything thrown: an Error, a PostgrestError-like object, or a string. */
export function errorMessage(e: unknown, fallback = "unknown error"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object") {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

/**
 * Uploads one file to `event-files` and inserts its EventFiles row. Returns the new row's id.
 * Throws an Error on a storage or insert error; after an insert error the stored object is removed.
 */
export async function uploadEventFile(params: {
  supabase: SupabaseClient<any>;
  eventId: string;
  file: File;
  source: string;
  uploadedBy: string | null | undefined;
}): Promise<string> {
  const { supabase, eventId, file, source, uploadedBy } = params;
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${eventId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(EVENT_FILES_BUCKET)
    .upload(storagePath, file, { upsert: false });
  if (uploadError) throw new Error(errorMessage(uploadError, "storage upload failed"));

  const id = crypto.randomUUID();
  const { error: insertError } = await supabase.from("EventFiles").insert({
    id,
    event_uuid: eventId,
    file_name: file.name,
    storage_path: storagePath,
    mime_type: file.type || null,
    file_size_bytes: file.size,
    source,
    uploaded_by: uploadedBy ?? null,
  });
  if (insertError) {
    // The file is in storage but has no row, so nothing would ever list or delete it. Best effort.
    try {
      await supabase.storage.from(EVENT_FILES_BUCKET).remove([storagePath]);
    } catch (cleanupError) {
      console.error("Could not remove the orphaned upload:", storagePath, cleanupError);
    }
    throw new Error(errorMessage(insertError, "could not save the file record"));
  }
  return id;
}
