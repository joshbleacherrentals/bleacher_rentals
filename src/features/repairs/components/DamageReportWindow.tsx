import { AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTimezoneStore } from "@/lib/useTimezoneStore";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useDamageReportViews } from "../hooks/useRepairDetails";
import { REPAIR_LAYER_CLASS } from "../utils/repairLayer";
import {
  reportsWindowTitle,
  type DamageLevel,
  type DamageReportView,
} from "../utils/repairDetails";
import type { ReportedReport } from "../utils/repairRows";
import { BleacherChip } from "./RepairChips";

/**
 * The damage report window: every report found for a repair or a service, earliest first, each in
 * its own card with who created it, the damage levels, the note, the photos and the state.
 * Read-only. docs/specs/repairs-06-expanded-row.md §2.4; the colours are those of the Damage
 * Reports page.
 */

const PHOTO_BUCKET = "damage-report-photos";
const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "heic", "heif", "webp"];

const LEVEL_CLASS: Record<DamageLevel, string> = {
  none: "text-green-700",
  minor: "text-yellow-700",
  major: "text-red-700",
};

const isImagePath = (path: string) =>
  IMAGE_EXTENSIONS.includes(path.split(".").pop()?.toLowerCase() ?? "");

function Photo({ path, photoUrl }: { path: string; photoUrl: (path: string) => string | null }) {
  const url = photoUrl(path);
  if (!url) return <div className="h-16 w-16 animate-pulse rounded bg-gray-100" />;
  if (!isImagePath(path)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="self-center text-sm text-[#1d62a3] underline underline-offset-2"
      >
        {path.split("/").pop() ?? path}
      </a>
    );
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt="Damage report photo"
        className="h-16 w-16 rounded border border-gray-200 object-cover transition hover:opacity-80"
      />
    </a>
  );
}

function ReportCard({
  report,
  photoUrl,
}: {
  report: DamageReportView;
  photoUrl: (path: string) => string | null;
}) {
  const confirmed = report.confirmations.length;
  return (
    <div
      data-testid="damage-report-card"
      className="rounded-lg border border-[#e5e7eb] bg-white p-4"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <BleacherChip number={report.bleacherNumber} />
        <span className="text-sm text-gray-700">{`Reported ${report.day}`}</span>
        {report.createdBy && (
          <span className="text-sm text-gray-500">{`by ${report.createdBy}`}</span>
        )}
        {report.resolvedDay ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="size-3" aria-hidden="true" />
            {`Resolved ${report.resolvedDay}`}
          </span>
        ) : (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            <AlertTriangle className="size-3" aria-hidden="true" />
            Open
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-4 text-xs">
        <span className={`font-medium capitalize ${LEVEL_CLASS[report.seat]}`}>
          {`Seat: ${report.seat}`}
        </span>
        <span className={`font-medium capitalize ${LEVEL_CLASS[report.haul]}`}>
          {`Haul: ${report.haul}`}
        </span>
      </div>

      {report.note && (
        <p className="mt-3 text-sm whitespace-pre-wrap text-gray-700">{report.note}</p>
      )}

      {report.photos.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {report.photos.map((photo) => (
            <Photo key={photo.id} path={photo.path} photoUrl={photoUrl} />
          ))}
        </div>
      )}

      {confirmed > 0 && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <p className="font-semibold">
            {`Confirmed by ${confirmed} ${confirmed === 1 ? "driver" : "drivers"}`}
          </p>
          <ul className="mt-1 space-y-0.5 text-xs">
            {report.confirmations.map((entry) => (
              <li key={entry.id}>
                {[entry.name, entry.day, entry.duringInspection ? "during an inspection" : null]
                  .filter(Boolean)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.fixedMark && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Wrench className="size-3.5" aria-hidden="true" />
          {report.fixedMark}
        </p>
      )}
    </div>
  );
}

export type DamageReportsContentProps = {
  reports: DamageReportView[];
  isLoading: boolean;
  /** The public URL of a photo path; null until the storage client is ready. */
  photoUrl: (path: string) => string | null;
};

/** The whole content of the window, a plain component so that a test can render it. */
export function DamageReportsContent({ reports, isLoading, photoUrl }: DamageReportsContentProps) {
  if (isLoading) return <p className="py-8 text-center text-sm text-gray-500">Loading...</p>;
  if (reports.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        The damage reports are not on this device yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} photoUrl={photoUrl} />
      ))}
    </div>
  );
}

export type DamageReportWindowProps = {
  reported: readonly ReportedReport[];
  onClose: () => void;
};

/** The dialog around the content; it also reads the reports, their photos and confirmations. */
export function DamageReportWindow({ reported, onClose }: DamageReportWindowProps) {
  const timezone = useTimezoneStore((s) => s.timezone);
  const supabase = useClerkSupabaseClient();
  const { reports, isLoading } = useDamageReportViews(reported, timezone);

  const photoUrl = (path: string) =>
    supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        data-testid="damage-report-window"
        className={`${REPAIR_LAYER_CLASS} max-h-[90vh] overflow-y-auto sm:max-w-[640px]`}
        overlayClassName={REPAIR_LAYER_CLASS}
      >
        <DialogHeader>
          <DialogTitle>{reportsWindowTitle(reported.length)}</DialogTitle>
          <DialogDescription className="sr-only">
            Damage reports found for this repair or service. Read-only.
          </DialogDescription>
        </DialogHeader>
        <DamageReportsContent reports={reports} isLoading={isLoading} photoUrl={photoUrl} />
      </DialogContent>
    </Dialog>
  );
}
