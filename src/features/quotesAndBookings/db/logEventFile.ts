import { typedExecute } from "@/lib/powersync/typedQuery";
import { eventLogInsert } from "./eventLogInsert";

/**
 * The Log rows of a file the person uploaded by hand and of one they deleted
 * (docs/specs/event-change-log-02-file-upload-delete.md §3).
 *
 * Each is one local write: the row is uploaded by PowerSync. It is not in the transaction of the
 * file itself, which goes to Supabase Storage and to Supabase directly, so it is written after the
 * file step has succeeded (`uploadEventFile`, `removeEventFile`). A write that fails is the caller's
 * to catch: the file stays, and the caller says the row is missing.
 *
 * One file is one row. `file_add`, for the files of the send dialog, is a different type and is not
 * written here.
 */

type FileLog = {
  eventId: string;
  fileName: string;
  /** `Users.id` of who did it, not the Clerk id. Null shows as "System" in the Log. */
  changedByUserUuid: string | null;
};

/** After the file went up. Writes one `file_upload` row (field `file`, next = the file name). */
export async function logFileUploaded(p: FileLog): Promise<void> {
  await typedExecute(
    eventLogInsert({
      eventId: p.eventId,
      changedByUserUuid: p.changedByUserUuid,
      fieldName: "file",
      prevValue: null,
      nextValue: p.fileName,
      actionType: "file_upload",
    }),
  );
}

/** After the file was deleted. Writes one `file_delete` row (field `file`, prev = the file name). */
export async function logFileDeleted(p: FileLog): Promise<void> {
  await typedExecute(
    eventLogInsert({
      eventId: p.eventId,
      changedByUserUuid: p.changedByUserUuid,
      fieldName: "file",
      prevValue: p.fileName,
      nextValue: null,
      actionType: "file_delete",
    }),
  );
}
