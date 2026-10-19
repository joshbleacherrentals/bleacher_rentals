import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddedFileInput } from "./sendQuote";

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

const STORED_NAME_RE = /^[0-9a-f-]{36}\.[a-z0-9]{1,10}$/i;

/**
 * Whether `path` is a path the send dialog could have uploaded for this event:
 * `<eventId>/<uuid>.<ext>`, one level under the event's folder. Rejects `..`, other events'
 * folders and anything nested. The server relies on this to read only this event's own objects.
 */
export function isOwnEventFilePath(eventId: string, path: string): boolean {
  if (!eventId || !path.startsWith(`${eventId}/`)) return false;
  return STORED_NAME_RE.test(path.slice(eventId.length + 1));
}

/**
 * Uploads one file to `event-files` and creates NO EventFiles row (the send route does, after the
 * email went out). The returned `id` is the one that row will use. Throws on a storage error.
 */
export async function uploadEventFileObject(params: {
  supabase: SupabaseClient<any>;
  eventId: string;
  file: File;
}): Promise<AddedFileInput> {
  const { supabase, eventId, file } = params;
  const dot = file.name.lastIndexOf(".");
  const rawExt = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : "";
  const ext = /^[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : "bin";
  const storagePath = `${eventId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(EVENT_FILES_BUCKET)
    .upload(storagePath, file, { upsert: false });
  if (error) throw new Error(errorMessage(error, "storage upload failed"));
  return {
    id: crypto.randomUUID(),
    storagePath,
    name: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

/**
 * Best effort: deletes uploaded send-dialog objects that have no EventFiles row. A file whose row
 * exists (a send that reached the server despite an error on our side) is kept. If the check
 * itself fails nothing is deleted. Never throws.
 */
export async function removeUnrecordedEventFileObjects(
  supabase: SupabaseClient<any>,
  files: { id: string; storagePath: string }[],
): Promise<void> {
  if (files.length === 0) return;
  try {
    const { data, error } = await supabase
      .from("EventFiles")
      .select("id")
      .in(
        "id",
        files.map((f) => f.id),
      );
    if (error) throw error;
    const recorded = new Set((data ?? []).map((r: { id: string }) => r.id));
    const paths = files.filter((f) => !recorded.has(f.id)).map((f) => f.storagePath);
    if (paths.length === 0) return;
    const { error: removeError } = await supabase.storage.from(EVENT_FILES_BUCKET).remove(paths);
    if (removeError) throw removeError;
  } catch (e) {
    console.error("Could not remove the uploaded files of a send that did not go out:", e);
  }
}
