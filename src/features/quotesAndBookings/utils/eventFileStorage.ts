import type { SupabaseClient } from "@supabase/supabase-js";
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

/** A link to the file that lives one hour. Throws the storage error. */
export async function createEventFileUrl(
  supabase: SupabaseClient<any>,
  storagePath: string,
): Promise<string> {
  const { bucket, path } = eventFileLocation(storagePath);
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Removes the stored object and then the EventFiles row. The storage answer is not read, as the
 * quote card never did: the row goes either way. Throws the error of the row delete.
 */
export async function removeEventFile(
  supabase: SupabaseClient<any>,
  file: { id: string; storage_path: string },
): Promise<void> {
  const { bucket, path } = eventFileLocation(file.storage_path);
  await supabase.storage.from(bucket).remove([path]);
  const { error } = await supabase.from("EventFiles").delete().eq("id", file.id);
  if (error) throw error;
}
