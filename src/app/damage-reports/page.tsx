"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  X,
  Trash2,
  RotateCcw,
  ImageUp,
  Wrench,
  Users,
} from "lucide-react";
import { DamageReportModal, EditDamageReport } from "./DamageReportModal";
import { useAcknowledgements, type AcknowledgementSummary } from "./_lib/acknowledgements";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { useUserAccess } from "@/features/userAccess/client";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import {
  useDamageReports,
  useBleacherFilterOptions,
  setDamageReportDeleted,
  type DamageReport,
  type DamageSeverity,
} from "./_lib/db";

function DamageReportsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { isAdmin } = useTeamPermissions();
  const access = useUserAccess();
  const isDeveloper = access.status === "active" && access.roles.includes("developer");
  const [showResolved, setShowResolved] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [hideNotUploaded, setHideNotUploaded] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReport, setEditingReport] = useState<DamageReport | null>(null);

  const bleacherUuid = searchParams.get("bleacher_uuid");

  // Reactive PowerSync reads (see docs/POWERSYNC_ARCHITECTURE.md)
  const bleachers = useBleacherFilterOptions();
  const { reports, isLoading } = useDamageReports({ bleacherUuid, showDeleted, hideNotUploaded });

  const handleSetDeleted = async (reportId: string, deleted: boolean) => {
    try {
      await setDamageReportDeleted(reportId, deleted);
      createSuccessToast([deleted ? "Damage report deleted." : "Damage report restored."]);
    } catch (e) {
      createErrorToast([`Failed to ${deleted ? "delete" : "restore"} report.`, String(e)]);
    }
  };

  const filteredReports = useMemo(
    () =>
      // In the deleted view, show every deleted report regardless of resolved state.
      showDeleted
        ? reports
        : reports.filter((r) => (showResolved ? r.resolved_at !== null : r.resolved_at === null)),
    [reports, showResolved, showDeleted],
  );

  // Confirmations from other drivers on the reports currently listed. This is
  // what a manager now prioritises by: three drivers confirming one report
  // matters more than three separate reports ever did, and it is the only
  // visible sign that the deduplication is working rather than that drivers
  // stopped reporting.
  const { byReport: acknowledgementsByReport } = useAcknowledgements(
    useMemo(() => filteredReports.map((report) => report.id), [filteredReports]),
  );

  const selectedBleacherNumber = useMemo(() => {
    if (!bleacherUuid) return null;
    return bleachers.find((b) => b.id === bleacherUuid)?.bleacher_number ?? null;
  }, [bleacherUuid, bleachers]);

  const handleFilterChange = (uuid: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (uuid) {
      params.set("bleacher_uuid", uuid);
    } else {
      params.delete("bleacher_uuid");
    }
    router.push(`/damage-reports?${params.toString()}`);
  };

  return (
    <>
      <PageHeader
        title="Damage Reports"
        subtitle={
          selectedBleacherNumber
            ? `Showing for Bleacher #${selectedBleacherNumber}`
            : "All damage reports across the fleet"
        }
        action={
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-darkBlue text-white text-sm font-semibold rounded-md shadow-md hover:bg-lightBlue transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Create Damage Report
          </button>
        }
      />

      {/* Filter bar */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm font-medium text-gray-600">Filter by bleacher:</label>
        <select
          value={bleacherUuid ?? ""}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="px-3 py-1.5 border rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-darkBlue focus:border-0"
        >
          <option value="">All Bleachers</option>
          {bleachers.map((b) => (
            <option key={b.id} value={b.id}>
              #{b.bleacher_number}
            </option>
          ))}
        </select>
        {bleacherUuid && (
          <button
            onClick={() => handleFilterChange("")}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isDeveloper && (
            <button
              onClick={() => setHideNotUploaded((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition cursor-pointer ${
                hideNotUploaded
                  ? "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                  : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
              }`}
              title={
                hideNotUploaded
                  ? "Reports with photos still uploading are hidden"
                  : "Showing reports with photos still uploading"
              }
            >
              <ImageUp className="h-3.5 w-3.5" />
              {hideNotUploaded ? "Hiding Uploading Photos" : "Showing Uploading Photos"}
            </button>
          )}

          {isAdmin && (
            <button
              onClick={() => setShowDeleted((v) => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition cursor-pointer ${
                showDeleted
                  ? "border-gray-400 bg-gray-100 text-gray-800 hover:bg-gray-200"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {showDeleted ? "Showing Deleted" : "Show Deleted"}
            </button>
          )}

          <button
            onClick={() => setShowResolved((v) => !v)}
            disabled={showDeleted}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              showResolved
                ? "border-green-300 bg-green-50 text-green-700 hover:bg-green-100"
                : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
            }`}
          >
            {showResolved ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Showing Resolved
              </>
            ) : (
              <>
                <AlertTriangle className="h-3.5 w-3.5" />
                Showing Open
              </>
            )}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-darkBlue" />
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm">
            No {showDeleted ? "deleted" : showResolved ? "resolved" : "open"} damage reports found.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.map((report) => (
            <DamageReportCard
              key={report.id}
              report={report}
              acknowledgements={acknowledgementsByReport[report.id]}
              onClick={() => setEditingReport(report)}
              isAdmin={isAdmin}
              showDeleted={showDeleted}
              onDelete={() => handleSetDeleted(report.id, true)}
              onRestore={() => handleSetDeleted(report.id, false)}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <DamageReportModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          onSaved={() => setShowCreateModal(false)}
        />
      )}

      {/* Edit modal */}
      {editingReport && (
        <DamageReportModal
          open={!!editingReport}
          onOpenChange={(open) => {
            if (!open) setEditingReport(null);
          }}
          onSaved={() => setEditingReport(null)}
          editReport={editingReport as EditDamageReport}
        />
      )}
    </>
  );
}

// ─── Severity Badge ──────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<DamageSeverity, string> = {
  none: "text-green-700",
  minor: "text-yellow-700",
  major: "text-red-700",
};

function SeverityBadge({ label, severity }: { label: string; severity: DamageSeverity }) {
  return (
    <span className={`font-medium capitalize ${SEVERITY_COLORS[severity]}`}>
      {label}: {severity}
    </span>
  );
}

// ─── Damage Report Card ───────────────────────────────────────────────────────

function DamageReportCard({
  report,
  onClick,
  isAdmin,
  showDeleted,
  onDelete,
  onRestore,
  acknowledgements,
}: {
  report: DamageReport;
  acknowledgements?: AcknowledgementSummary;
  onClick: () => void;
  isAdmin: boolean;
  showDeleted: boolean;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const isResolved = !!report.resolved_at;

  return (
    <div
      onClick={onClick}
      className={`border rounded-lg p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition ${
        showDeleted
          ? "border-gray-200 bg-gray-50/50"
          : isResolved
            ? "border-gray-200"
            : "border-red-300 bg-red-50/30"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm text-gray-900">
              Bleacher #{report.bleacher?.bleacher_number ?? "?"}
            </span>
            {isResolved ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                <CheckCircle2 className="h-3 w-3" />
                Resolved
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                <AlertTriangle className="h-3 w-3" />
                Open
              </span>
            )}
            {/* A driver says this one is already fixed — still open, but the
                cheap end of the backlog: it closes in one click. */}
            {acknowledgements && !isResolved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                <Users className="h-3 w-3" />
                Confirmed by {acknowledgements.count}
                {acknowledgements.latestAt
                  ? ` · ${new Date(acknowledgements.latestAt).toLocaleDateString()}`
                  : ""}
              </span>
            )}
            {report.fixed_by_driver && !isResolved && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                <Wrench className="h-3 w-3" />
                Fixed by driver
              </span>
            )}
          </div>

          <div className="flex gap-4 text-xs text-gray-500 mb-2">
            <span>Created {new Date(report.created_at).toLocaleDateString()}</span>
            {report.created_by_user && (
              <span>
                by {report.created_by_user.first_name} {report.created_by_user.last_name}
              </span>
            )}
            {isResolved && (
              <span>Resolved {new Date(report.resolved_at!).toLocaleDateString()}</span>
            )}
          </div>

          <div className="flex gap-4 text-xs mb-2">
            <SeverityBadge label="Seat" severity={report.seat_damage} />
            <SeverityBadge label="Haul" severity={report.haul_damage} />
          </div>

          {report.note && <p className="text-sm text-gray-700 mb-2">{report.note}</p>}

          {report.maintenance_event && (
            <p className="text-xs text-gray-500">
              Linked to: <span className="font-medium">{report.maintenance_event.event_name}</span>
            </p>
          )}
        </div>

        <div className="flex items-start gap-3 flex-shrink-0">
          {report.photos.length > 0 && (
            <div className="flex gap-2">
              {report.photos.slice(0, 3).map((photo) => (
                <PhotoThumbnail key={photo.id} photoPath={photo.photo_path} />
              ))}
              {report.photos.length > 3 && (
                <span className="text-xs text-gray-400 self-end">
                  +{report.photos.length - 3} more
                </span>
              )}
            </div>
          )}

          {isAdmin &&
            (showDeleted ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore();
                }}
                className="flex items-center gap-1 rounded-md border border-green-300 bg-white px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-50 transition cursor-pointer"
                title="Restore damage report"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Restore
              </button>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition cursor-pointer"
                title="Delete damage report"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

function PhotoThumbnail({ photoPath }: { photoPath: string }) {
  const supabase = useClerkSupabaseClient();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !photoPath) return;
    const { data } = supabase.storage.from("damage-report-photos").getPublicUrl(photoPath);
    if (data?.publicUrl) setUrl(data.publicUrl);
  }, [supabase, photoPath]);

  if (!url) return <div className="w-16 h-16 bg-gray-100 rounded animate-pulse" />;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <img
        src={url}
        alt="Damage report photo"
        className="w-16 h-16 object-cover rounded border border-gray-200 hover:opacity-80 transition"
      />
    </a>
  );
}

export default function DamageReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-darkBlue" />
        </div>
      }
    >
      <DamageReportsContent />
    </Suspense>
  );
}
