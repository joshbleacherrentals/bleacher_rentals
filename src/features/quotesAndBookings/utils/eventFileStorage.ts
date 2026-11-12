import type { SupabaseClient } from "@supabase/supabase-js";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { logFileDeleted } from "../db/logEventFile";
import { EVENT_FILES_BUCKET } from "./eventFileUpload";

/**
 * Where an EventFiles object lives and the storage steps on it, shared by the quote card's Files
 * tab and the invoice page's Files table so the `contracts/` rule is written once.
 * docs/specs/accountant-collections-13-task-history-and-files.md §3.
 */

const CONTRACTS_BUCKET = "contracts";
const CONTRACTS_PREFIX = "contracts/";
const SIGNED_URL_SECONDS = 3600;

/** A `contracts/` path is an object of the `contracts` bucket, any other is in `event-files`. */
export function eventFileLocation(storagePath: string): { bucket: string; path: string } {
  if (storagePath.startsWith(CONTRACTS_PREFIX)) {
    return { bucket: CONTRACTS_BUCKET, path: storagePath.slice(CONTRACTS_PREFIX.length) };
  }
  return { bucket: EVENT_FILES_BUCKET, path: storagePath };
}

/**
 * A link to the file that lives one hour. Throws the storage error. With `options.download` (a file
 * name, or `true`) the storage answers the link with `Content-Disposition: attachment`, so the
 * browser saves the file instead of showing it; without options the call is exactly as it always
 * was (docs/specs/accountant-collections-21-files-row-click.md §3).
 */
export async function createEventFileUrl(
  supabase: SupabaseClient<any>,
  storagePath: string,
  options?: { download?: string | boolean },
): Promise<string> {
  const { bucket, path } = eventFileLocation(storagePath);
  const bucketApi = supabase.storage.from(bucket);
  const { data, error } = options
    ? await bucketApi.createSignedUrl(path, SIGNED_URL_SECONDS, options)
    : await bucketApi.createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Removes the stored object and then the EventFiles row, and writes the `file_delete` Log row. The
 * storage answer is not read, as the quote card never did: the row goes either way, and the delete
 * is recorded because the row is what the user sees go. Throws the error of the row delete, and then
 * writes no Log row. A Log row that fails does not throw: the file is gone, so it is reported with a
 * toast (docs/specs/event-change-log-02-file-upload-delete.md R2, R4, A1).
 * `log.eventId` is the quote whose Log gets the row; `log.changedByUserUuid` is the user's
 * `Users.id`.
 */
export async function removeEventFile(
  supabase: SupabaseClient<any>,
  file: { id: string; storage_path: string; file_name: string },
  log: { eventId: string; changedByUserUuid: string | null },
): Promise<void> {
  const { bucket, path } = eventFileLocation(file.storage_path);
  await supabase.storage.from(bucket).remove([path]);
  const { error } = await supabase.from("EventFiles").delete().eq("id", file.id);
  if (error) throw error;
  try {
    await logFileDeleted({
      eventId: log.eventId,
      fileName: file.file_name,
      changedByUserUuid: log.changedByUserUuid,
    });
  } catch (logError) {
    console.error("Could not write the Log row of a deleted file:", logError);
    createErrorToastNoThrow(["The file was deleted, but its Log row could not be written"]);
  }
}
