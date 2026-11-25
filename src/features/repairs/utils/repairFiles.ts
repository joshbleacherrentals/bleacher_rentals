import type { RawRepairFileRow, RepairFileRow } from "./repairWindow";

/**
 * The rules of the files of a repair and their words: what may be picked, the draft of the repair
 * window, the name and the path of an object, and the texts of the toasts and the dialog. Pure, so it
 * is tested without React or a network. docs/specs/repairs-09b3-files.md §2.2 to §2.6 and §3 (D191
 * to D204; the signatures are locked there).
 */

/** The public bucket of the files (spec 07 D99; the old Files tab uses it too). */
export const REPAIR_FILE_BUCKET = "maintenance-photos";

/** The bucket's limit: 10 MB, counted as 10 x 1024 x 1024 bytes (D197). */
export const REPAIR_FILE_MAX_BYTES = 10_485_760;

/** The 13 MIME types of the bucket (D197). */
export const REPAIR_FILE_MIME_TYPES: readonly string[] = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
];

/** The extension each MIME type is stored with when the file's name gives none (§2.4). */
const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/csv": "csv",
};

/** A file picked and not yet written (D191). `key` is a new uuid, for React and for removal. */
export type DraftFile = { key: string; file: File };

/** The files part of the draft of a window: picked files, and stored files marked removed. */
export type FilesDraft = { added: DraftFile[]; removed: RepairFileRow[] };

export const EMPTY_FILES_DRAFT: FilesDraft = { added: [], removed: [] };

/** True when a file is added or a stored file is removed. */
export function isFilesDraftChanged(draft: FilesDraft): boolean {
  return draft.added.length > 0 || draft.removed.length > 0;
}

export type RefusedFile = { name: string; reason: "type" | "size" };

/** Wording chosen by me; a reviewer can correct it (spec 09b3 §0, last item). */
export const REPAIR_FILE_MESSAGES = {
  refusedTitle: "Some files were not added.",
  notAllowedType: "this type of file is not allowed.",
  tooLarge: "larger than 10 MB.",
  savedNotAdded: "The repair was saved, but some files could not be added.",
  savedNotRemoved: "The repair was saved, but some files could not be removed.",
  savedNotUpdated: "The repair was saved, but some files could not be added or removed.",
  viewNotAdded: "Some files could not be added.",
  viewNotRemoved: "Failed to delete the file.",
  notOnServer: "The repair has not reached the server yet.",
} as const;

/**
 * D197: the type by `file.type` (an empty type is refused), then the size (more than 10 485 760 bytes
 * is refused, exactly that many is accepted). A file that is both the wrong type and too large is a
 * "type". The order is kept.
 */
export function checkPickedFiles(files: readonly File[]): {
  accepted: File[];
  refused: RefusedFile[];
} {
  const accepted: File[] = [];
  const refused: RefusedFile[] = [];
  for (const file of files) {
    if (!REPAIR_FILE_MIME_TYPES.includes(file.type)) {
      refused.push({ name: file.name, reason: "type" });
    } else if (file.size > REPAIR_FILE_MAX_BYTES) {
      refused.push({ name: file.name, reason: "size" });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, refused };
}

/** One line for each refused file (§2.3): "IMG_0412.zip: this type of file is not allowed.". */
export function refusedFilesLines(refused: readonly RefusedFile[]): string[] {
  return refused.map(
    (entry) =>
      `${entry.name}: ${
        entry.reason === "type"
          ? REPAIR_FILE_MESSAGES.notAllowedType
          : REPAIR_FILE_MESSAGES.tooLarge
      }`,
  );
}

export function addDraftFiles(
  draft: FilesDraft,
  files: readonly File[],
  makeKey: () => string,
): FilesDraft {
  return {
    ...draft,
    added: [...draft.added, ...files.map((file) => ({ key: makeKey(), file }))],
  };
}

export function removeDraftFile(draft: FilesDraft, key: string): FilesDraft {
  return { ...draft, added: draft.added.filter((entry) => entry.key !== key) };
}

/** Marks a stored file removed; a second call for the same id changes nothing. */
export function removeStoredFile(draft: FilesDraft, row: RepairFileRow): FilesDraft {
  if (draft.removed.some((entry) => entry.id === row.id)) return draft;
  return { ...draft, removed: [...draft.removed, row] };
}

/** The raw rows that are not marked removed; `buildRepairFileRows` then names them again (D202). */
export function storedRowsAfterRemovals(
  raw: readonly RawRepairFileRow[],
  draft: FilesDraft,
): RawRepairFileRow[] {
  const gone = new Set(draft.removed.map((row) => row.id));
  return raw.filter((row) => !gone.has(row.id));
}

/**
 * The extension of the object's path (§2.4): the text after the last dot of the name, in lower case,
 * when it is made of letters and digits; otherwise the extension of the MIME type. `bin` is the last
 * resort for a type that is not in the list (a file that failed the check never gets here).
 */
export function fileExtension(file: { name: string; type: string }): string {
  const dot = file.name.lastIndexOf(".");
  if (dot !== -1) {
    const tail = file.name.slice(dot + 1);
    if (/^[A-Za-z0-9]+$/.test(tail)) return tail.toLowerCase();
  }
  return EXTENSION_BY_MIME[file.type] ?? "bin";
}

/** `<repair id>/<object id>.<extension>`. */
export function repairFilePath(
  repairId: string,
  objectId: string,
  file: { name: string; type: string },
): string {
  return `${repairId}/${objectId}.${fileExtension(file)}`;
}

/** "12 B", "340 KB", "2.4 MB" (D200). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = Math.round(bytes / 1024);
  if (kb < 1024) return `${kb} KB`;
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb.endsWith(".0") ? mb.slice(0, -2) : mb} MB`;
}

export type DeleteFileMode = "now" | "onSave";

/** The title and the text of the dialog of a stored file (D202). */
export function deleteFileDialogText(
  name: string,
  mode: DeleteFileMode,
): { title: string; description: string } {
  return {
    title: "Are you absolutely sure?",
    description:
      mode === "now"
        ? `This removes ${name} from the repair. It cannot be undone in the app.`
        : `${name} will be removed from the repair when you save.`,
  };
}

export type FileFailure = { name: string; message: string };
export type SaveFilesResult = { notAdded: FileFailure[]; notRemoved: FileFailure[] };

/**
 * The lines of the red toast of a failed write (§2.4 step 6, §2.5), or null when nothing failed.
 * "save": the title says the repair was saved. "view": the titles of the view mode. Then a line for
 * the files not added (names on the disk), a line for the files not removed, and the text of the
 * first failure.
 */
export function filesFailureLines(
  result: SaveFilesResult,
  context: "save" | "view",
): string[] | null {
  const { notAdded, notRemoved } = result;
  if (notAdded.length === 0 && notRemoved.length === 0) return null;

  let title: string;
  if (context === "save") {
    title =
      notAdded.length > 0 && notRemoved.length > 0
        ? REPAIR_FILE_MESSAGES.savedNotUpdated
        : notAdded.length > 0
          ? REPAIR_FILE_MESSAGES.savedNotAdded
          : REPAIR_FILE_MESSAGES.savedNotRemoved;
  } else {
    title =
      notAdded.length === 0
        ? REPAIR_FILE_MESSAGES.viewNotRemoved
        : REPAIR_FILE_MESSAGES.viewNotAdded;
  }

  const lines = [title];
  if (notAdded.length > 0) lines.push(`Not added: ${notAdded.map((f) => f.name).join(", ")}`);
  if (notRemoved.length > 0) {
    lines.push(`Not removed: ${notRemoved.map((f) => f.name).join(", ")}`);
  }
  lines.push((notAdded[0] ?? notRemoved[0]).message);
  return lines;
}
