import { Download, FileText } from "lucide-react";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useRepairFiles } from "../hooks/useRepairDetails";
import type { RepairFileRow } from "../utils/repairWindow";

/**
 * The Files section of the repair window: the files of a repair as rows named by their type, each
 * opening in a new tab. Read-only: no delete button and no drop zone (spec 09). The list is read
 * from Supabase, so it has a loading and a failed state. docs/specs/repairs-07-repair-window.md §2.5
 * (D99, D102, D103, D104); the looks are the canvas's.
 */

/** The public bucket the files are stored in (the old Files tab uses it too). */
const FILE_BUCKET = "maintenance-photos";

const NOTE = "mt-2.5 text-sm leading-5 text-[#9ca3af]";

export type RepairFilesContentProps = {
  state: "loading" | "error" | "ready";
  files: RepairFileRow[];
  /** The public URL of the object at a path. */
  fileUrl: (path: string) => string;
};

/** The whole section, a plain component so that a test can render it. */
export function RepairFilesContent({ state, files, fileUrl }: RepairFilesContentProps) {
  return (
    <section data-testid="repair-files">
      <h3 className="mt-7 text-base leading-6 font-semibold text-[#10365a]">Files</h3>
      {state === "loading" ? (
        <p className={NOTE}>Loading...</p>
      ) : state === "error" ? (
        <p className={NOTE}>Files could not be loaded. They need a connection.</p>
      ) : files.length === 0 ? (
        <p className={NOTE}>No files.</p>
      ) : (
        <div className="mt-2.5 overflow-hidden rounded-lg border border-[#e5e7eb]">
          {files.map((file, index) => {
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
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[#4b5563] hover:bg-[#f3f4f6] focus-visible:ring-2 focus-visible:ring-[#1d62a3] focus-visible:outline-none"
                >
                  <Download className="size-4" aria-hidden="true" />
                </a>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/** The section with its read. Mounted only for a role that may read the files (D102). */
export function RepairFiles({ repairId }: { repairId: string }) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const supabase = useClerkSupabaseClient();
  const { state, files } = useRepairFiles(repairId, timezone);

  const fileUrl = (path: string) =>
    supabase.storage.from(FILE_BUCKET).getPublicUrl(path).data.publicUrl;

  return <RepairFilesContent state={state} files={files} fileUrl={fileUrl} />;
}
