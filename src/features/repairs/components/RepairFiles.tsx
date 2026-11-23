import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileText, Plus, Trash2 } from "lucide-react";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
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
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { makeRepairFilesClient, saveRepairFiles } from "../db/repairFileWrite";
import { useRepairFiles } from "../hooks/useRepairDetails";
import {
  REPAIR_FILE_BUCKET,
  REPAIR_FILE_MESSAGES,
  REPAIR_FILE_MIME_TYPES,
  addDraftFiles,
  checkPickedFiles,
  deleteFileDialogText,
  filesFailureLines,
  formatFileSize,
  refusedFilesLines,
  removeDraftFile,
  removeStoredFile,
  storedRowsAfterRemovals,
  type DeleteFileMode,
  type DraftFile,
  type FilesDraft,
} from "../utils/repairFiles";
import { buildRepairFileRows, type RepairFileRow } from "../utils/repairWindow";

/**
 * The Files section of the repair window: the files of a repair as rows named by their type, each
 * opening in a new tab. A role that writes also gets a bin on each stored row, the draft rows of New
 * repair and Edit, and Add file; the view mode writes at once, Edit and New repair keep a draft until
 * Save. The list is read from Supabase, so it has a loading and a failed state.
 * docs/specs/repairs-07-repair-window.md §2.5 (D99, D102, D103, D104) and
 * docs/specs/repairs-09b3-files.md §2.2 to §2.6 (D190 to D202); the looks are the canvas's.
 */

const NOTE = "mt-2.5 text-sm leading-5 text-[#9ca3af]";
const ICON_BUTTON =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#4b5563] hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

/** What the section needs from a role that writes (D201); absent, the list is spec 07's read-only one. */
export type RepairFilesControls = {
  /** Add file is drawn (D201): the list has loaded, or this is New repair. */
  canAdd: boolean;
  /** A write runs (a Save, an upload, a deletion): every button is disabled; Add file says so. */
  busy: boolean;
  /** The draft files, in the order picked (Edit, New repair); empty in the view mode. */
  added: readonly DraftFile[];
  onPick: (files: File[]) => void;
  onRemoveDraft: (key: string) => void;
  /** Opens the dialog of D202 for a stored file. */
  onRemoveStored: (row: RepairFileRow) => void;
};

export type RepairFilesContentProps = {
  state: "loading" | "error" | "ready";
  files: RepairFileRow[];
  /** The public URL of the object at a path. */
  fileUrl: (path: string) => string;
  controls?: RepairFilesControls;
};

function AddFileButton({ busy, onPick }: { busy: boolean; onPick: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        data-testid="repair-file-add"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d1d5db] bg-white px-3 text-sm leading-5 font-semibold text-[#10365a] hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-3.5" aria-hidden="true" />
        {busy ? "Uploading..." : "Add file"}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={REPAIR_FILE_MIME_TYPES.join(",")}
        data-testid="repair-file-input"
        className="hidden"
        tabIndex={-1}
        disabled={busy}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);
          // Emptied so that the same file can be picked again.
          event.target.value = "";
          if (picked.length > 0) onPick(picked);
        }}
      />
    </div>
  );
}

/** The whole section, a plain component so that a test can render it. */
export function RepairFilesContent({ state, files, fileUrl, controls }: RepairFilesContentProps) {
  const stored = state === "ready" ? files : [];
  const added = controls?.added ?? [];
  const busy = controls?.busy ?? false;
  const hasRows = stored.length > 0 || added.length > 0;

  return (
    <section data-testid="repair-files">
      <h3 className="mt-7 text-base leading-6 font-semibold text-[#10365a]">Files</h3>
      {state === "loading" ? (
        <p className={NOTE}>Loading...</p>
      ) : state === "error" ? (
        <p className={NOTE}>Files could not be loaded. They need a connection.</p>
      ) : !hasRows ? (
        <p className={NOTE}>No files.</p>
      ) : null}
      {hasRows && (
        <div className="mt-2.5 overflow-hidden rounded-lg border border-[#e5e7eb]">
          {stored.map((file, index) => {
            const url = fileUrl(file.path);
            return (
              <div
                key={file.id}
                data-testid="repair-file"
                className={`flex min-h-12 items-center gap-3 px-3 text-sm leading-5 ${
                  index > 0 ? "border-t border-[#e5e7eb]" : ""
                }`}
              >
                <FileText className="size-[18px] shrink-0 text-[#6b7280]" aria-hidden="true" />
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate font-medium text-[#1d62a3] hover:underline"
                >
                  {file.name}
                </a>
                {file.day && (
                  <span className="shrink-0 text-[13px] text-[#6b7280]">{`Added ${file.day}`}</span>
                )}
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${file.name}`}
                  className={ICON_BUTTON}
                >
                  <Download className="size-4" aria-hidden="true" />
                </a>
                {controls && (
                  <button
                    type="button"
                    data-testid="repair-file-delete"
                    aria-label={`Delete ${file.name}`}
                    disabled={busy}
                    onClick={() => controls.onRemoveStored(file)}
                    className={`${ICON_BUTTON} cursor-pointer`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
          {controls &&
            added.map((entry, index) => (
              <div
                key={entry.key}
                data-testid="repair-file-draft"
                className={`flex min-h-12 items-center gap-3 px-3 text-sm leading-5 ${
                  stored.length + index > 0 ? "border-t border-[#e5e7eb]" : ""
                }`}
              >
                <FileText className="size-[18px] shrink-0 text-[#6b7280]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-[#374151]">
                  {entry.file.name}
                </span>
                <span className="shrink-0 text-[13px] text-[#6b7280]">
                  {formatFileSize(entry.file.size)}
                </span>
                <button
                  type="button"
                  data-testid="repair-file-draft-remove"
                  aria-label={`Remove ${entry.file.name}`}
                  disabled={busy}
                  onClick={() => controls.onRemoveDraft(entry.key)}
                  className={`${ICON_BUTTON} cursor-pointer`}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>
            ))}
        </div>
      )}
      {controls?.canAdd && <AddFileButton busy={busy} onPick={controls.onPick} />}
    </section>
  );
}

/** The dialog of a stored file (D202): the view mode deletes at once, Edit marks the file removed. */
export function DeleteFileDialog({
  row,
  mode,
  busy,
  onCancel,
  onContinue,
}: {
  row: RepairFileRow | null;
  mode: DeleteFileMode;
  busy: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const text = deleteFileDialogText(row?.name ?? "", mode);
  return (
    <AlertDialog open={row !== null} onOpenChange={(next) => !next && !busy && onCancel()}>
      <AlertDialogContent data-testid="repair-file-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{text.title}</AlertDialogTitle>
          <AlertDialogDescription>{text.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="cursor-pointer rounded-sm" disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="cursor-pointer rounded-sm bg-red-800 text-white hover:bg-red-900"
            disabled={busy}
            onClick={(event) => {
              // Radix would close the dialog now; it stays open until the work is done.
              event.preventDefault();
              onContinue();
            }}
          >
            {busy ? "Deleting..." : "Continue"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The public URL of an object of the bucket, from the client of the Clerk session. */
function publicUrlOf(supabase: ReturnType<typeof useClerkSupabaseClient>) {
  return (path: string) =>
    supabase.storage.from(REPAIR_FILE_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** What a pick does first (§2.3): check each file and show the toast of the refused ones. */
function checkAndReport(picked: File[]): File[] {
  const { accepted, refused } = checkPickedFiles(picked);
  if (refused.length > 0) {
    createErrorToastNoThrow([REPAIR_FILE_MESSAGES.refusedTitle, ...refusedFilesLines(refused)]);
  }
  return accepted;
}

/**
 * View mode: reads the list and, for a writer, writes at once (D191): a pick is uploaded, a deletion
 * confirmed in the dialog is made. Mounted only for a role that may read the files (D102).
 */
export function RepairFiles({ repairId, canWrite }: { repairId: string; canWrite: boolean }) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const { state, files } = useRepairFiles(repairId, timezone);
  const fileUrl = publicUrlOf(supabase);
  const client = useMemo(() => makeRepairFilesClient(supabase), [supabase]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<RepairFileRow | null>(null);

  const run = async (added: DraftFile[], removed: RepairFileRow[]) => {
    setBusy(true);
    try {
      const result = await saveRepairFiles({ client, repairId, added, removed });
      await queryClient.invalidateQueries({ queryKey: ["repair-files", repairId] });
      const lines = filesFailureLines(result, "view");
      if (lines) createErrorToastNoThrow(lines);
    } finally {
      setBusy(false);
    }
  };

  const controls: RepairFilesControls | undefined = canWrite
    ? {
        canAdd: state === "ready",
        busy,
        added: [],
        onPick: (picked) => {
          if (busy) return;
          const accepted = checkAndReport(picked);
          if (accepted.length === 0) return;
          void run(
            accepted.map((file) => ({ key: crypto.randomUUID(), file })),
            [],
          );
        },
        onRemoveDraft: () => {},
        onRemoveStored: setPending,
      }
    : undefined;

  return (
    <>
      <RepairFilesContent state={state} files={files} fileUrl={fileUrl} controls={controls} />
      {canWrite && (
        <DeleteFileDialog
          row={pending}
          mode="now"
          busy={busy}
          onCancel={() => setPending(null)}
          onContinue={() => {
            const row = pending;
            if (!row) return;
            void run([], [row]).then(() => setPending(null));
          }}
        />
      )}
    </>
  );
}

type DraftProps = {
  draft: FilesDraft;
  onChange: Dispatch<SetStateAction<FilesDraft>>;
  /** The window is saving: every button is disabled. */
  disabled: boolean;
};

function draftControls(
  { draft, onChange, disabled }: DraftProps,
  canAdd: boolean,
  onRemoveStored: (row: RepairFileRow) => void,
): RepairFilesControls {
  return {
    canAdd,
    busy: disabled,
    added: draft.added,
    onPick: (picked) => {
      const accepted = checkAndReport(picked);
      if (accepted.length > 0) {
        onChange((current) => addDraftFiles(current, accepted, () => crypto.randomUUID()));
      }
    },
    onRemoveDraft: (key) => onChange((current) => removeDraftFile(current, key)),
    onRemoveStored,
  };
}

/** Edit: the stored list minus the removed ones, plus the draft (D191, D202). */
export function RepairFilesEdit({ repairId, ...draftProps }: DraftProps & { repairId: string }) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const { state, raw } = useRepairFiles(repairId, timezone);
  const fileUrl = publicUrlOf(useClerkSupabaseClient());
  const [pending, setPending] = useState<RepairFileRow | null>(null);
  const files = useMemo(
    () => buildRepairFileRows(storedRowsAfterRemovals(raw, draftProps.draft), timezone),
    [raw, draftProps.draft, timezone],
  );

  return (
    <>
      <RepairFilesContent
        state={state}
        files={files}
        fileUrl={fileUrl}
        controls={draftControls(draftProps, state === "ready", setPending)}
      />
      <DeleteFileDialog
        row={pending}
        mode="onSave"
        busy={false}
        onCancel={() => setPending(null)}
        onContinue={() => {
          const row = pending;
          if (row) draftProps.onChange((current) => removeStoredFile(current, row));
          setPending(null);
        }}
      />
    </>
  );
}

/** New repair: no stored list (09b1 D149), only the draft. Add file is always drawn (D201). */
export function RepairFilesNew(props: DraftProps) {
  return (
    <RepairFilesContent
      state="ready"
      files={[]}
      fileUrl={() => ""}
      controls={draftControls(props, true, () => {})}
    />
  );
}
