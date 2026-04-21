"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Plus, X, ClipboardCheck, FileText } from "lucide-react";
import { DamageReportModal, EditDamageReport } from "./DamageReportModal";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

type DamageReport = {
  id: string;
  bleacher_uuid: string;
  inspection_uuid: string;
  is_safe_to_sit: boolean;
  is_safe_to_haul: boolean;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  maintenance_event_uuid: string | null;
  bleacher: { bleacher_number: number } | null;
  maintenance_event: { event_name: string } | null;
  photos: { id: string; photo_path: string }[];
};

type InspectionAnswer = {
  question_text: string;
  question_type: "text" | "checkbox" | "photo";
  required: boolean;
  value?: string | boolean;
  photos?: { storage_path: string }[];
};

type InspectionRow = {
  id: string;
  created_at: string;
  answers_json: string | null;
  walk_around_complete: boolean;
  issues_found: boolean;
  issue_description: string | null;
};

type WorkTrackerWithInspection = {
  id: string;
  date: string | null;
  bleacher_uuid: string | null;
  pre_inspection_uuid: string | null;
  post_inspection_uuid: string | null;
  bleacher: { bleacher_number: number } | null;
  work_tracker_type: { display_name: string } | null;
  driver: { first_name: string; last_name: string } | null;
  pre_inspection: InspectionRow | null;
  post_inspection: InspectionRow | null;
};

const pageTabs = ["Damage Reports", "Inspections"] as const;
type PageTab = (typeof pageTabs)[number];

function DamageReportsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingReport, setEditingReport] = useState<DamageReport | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const bleacherUuid = searchParams.get("bleacher_uuid");
  const workTrackerIdParam = searchParams.get("work_tracker_id");
  const tabParam = searchParams.get("tab");
  const activeTab: PageTab = tabParam === "inspections" ? "Inspections" : "Damage Reports";

  // Fetch all bleachers for the filter dropdown
  const { data: bleachers = [] } = useQuery({
    queryKey: ["bleachers-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("Bleachers")
        .select("id, bleacher_number")
        .eq("deleted", false)
        .order("bleacher_number", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!supabase,
  });

  // Fetch damage reports
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["damage-reports", bleacherUuid],
    queryFn: async () => {
      let query = supabase
        .from("DamageReports")
        .select(
          `
          *,
          bleacher:Bleachers!DamageReports_bleacher_uuid_fkey(bleacher_number),
          maintenance_event:MaintenanceEvents!DamageReports_maintenance_event_uuid_fkey(event_name),
          photos:DamageReportPhotos!DamageReportPhotos_damage_report_uuid_fkey(id, photo_path)
        `,
        )
        .order("created_at", { ascending: false });

      if (bleacherUuid) {
        query = query.eq("bleacher_uuid", bleacherUuid);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DamageReport[];
    },
    enabled: !!supabase,
  });

  // Fetch work trackers with inspections
  const { data: inspectionTrackers = [], isLoading: loadingInspections } = useQuery({
    queryKey: ["inspections-list", bleacherUuid, workTrackerIdParam],
    queryFn: async () => {
      let query = supabase
        .from("WorkTrackers")
        .select(
          `
          id,
          date,
          bleacher_uuid,
          pre_inspection_uuid,
          post_inspection_uuid,
          bleacher:Bleachers!WorkTrackers_bleacher_uuid_fkey(bleacher_number),
          work_tracker_type:WorkTrackerTypes!worktrackers_work_tracker_type_uuid_fkey(display_name),
          driver:Drivers!WorkTrackers_driver_uuid_fkey(first_name, last_name),
          pre_inspection:WorkTrackerInspections!WorkTrackers_pre_inspection_uuid_fkey(id, created_at, answers_json, walk_around_complete, issues_found, issue_description),
          post_inspection:WorkTrackerInspections!WorkTrackers_post_inspection_uuid_fkey(id, created_at, answers_json, walk_around_complete, issues_found, issue_description)
        `,
        )
        .or("pre_inspection_uuid.not.is.null,post_inspection_uuid.not.is.null")
        .order("date", { ascending: false });

      if (workTrackerIdParam) {
        query = query.eq("id", workTrackerIdParam);
      } else if (bleacherUuid) {
        query = query.eq("bleacher_uuid", bleacherUuid);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as WorkTrackerWithInspection[];
    },
    enabled: !!supabase && activeTab === "Inspections",
  });

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
    params.delete("work_tracker_id");
    router.push(`/damage-reports?${params.toString()}`);
  };

  const handleTabChange = (tab: PageTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "Inspections") {
      params.set("tab", "inspections");
    } else {
      params.delete("tab");
    }
    params.delete("work_tracker_id");
    router.push(`/damage-reports?${params.toString()}`);
  };

  return (
    <>
      <PageHeader
        title="Damage Reports & Inspections"
        subtitle={
          selectedBleacherNumber
            ? `Showing for Bleacher #${selectedBleacherNumber}`
            : "All damage reports and inspections across the fleet"
        }
        action={
          activeTab === "Damage Reports" ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-darkBlue text-white text-sm font-semibold rounded-md shadow-md hover:bg-lightBlue transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              Create Damage Report
            </button>
          ) : undefined
        }
      />

      {/* Tabs + Filter bar */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-1">
          {pageTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => handleTabChange(tab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer transition ${
                activeTab === tab
                  ? "bg-darkBlue text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="h-6 w-px bg-gray-300" />

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
      </div>

      {/* Damage Reports tab */}
      {activeTab === "Damage Reports" && (
        <>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-darkBlue" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <AlertTriangle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No damage reports found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <DamageReportCard
                  key={report.id}
                  report={report}
                  onClick={() => setEditingReport(report)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Inspections tab */}
      {activeTab === "Inspections" && (
        <>
          {loadingInspections ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-darkBlue" />
            </div>
          ) : inspectionTrackers.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ClipboardCheck className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No inspections found.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {inspectionTrackers.map((wt) => (
                <InspectionCard key={wt.id} workTracker={wt} onPhotoClick={setLightboxUrl} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Create modal */}
      {showCreateModal && (
        <DamageReportModal
          open={showCreateModal}
          onOpenChange={setShowCreateModal}
          onSaved={() => {
            setShowCreateModal(false);
            queryClient.invalidateQueries({ queryKey: ["damage-reports"] });
          }}
        />
      )}

      {/* Edit modal */}
      {editingReport && (
        <DamageReportModal
          open={!!editingReport}
          onOpenChange={(open) => {
            if (!open) setEditingReport(null);
          }}
          onSaved={() => {
            setEditingReport(null);
            queryClient.invalidateQueries({ queryKey: ["damage-reports"] });
          }}
          editReport={editingReport as EditDamageReport}
        />
      )}

      {/* Lightbox */}
      <Dialog
        open={!!lightboxUrl}
        onOpenChange={(open) => {
          if (!open) setLightboxUrl(null);
        }}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 flex items-center justify-center bg-black/90 border-none">
          <VisuallyHidden>
            <DialogTitle>Photo preview</DialogTitle>
          </VisuallyHidden>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Inspection photo"
              className="max-w-full max-h-[85vh] object-contain rounded"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Inspection Card ──────────────────────────────────────────────────────────

function parseAnswers(json: string | null): Record<string, InspectionAnswer> {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function InspectionSection({
  label,
  inspection,
  onPhotoClick,
}: {
  label: string;
  inspection: InspectionRow;
  onPhotoClick: (url: string) => void;
}) {
  const supabase = useClerkSupabaseClient();
  const answers = useMemo(() => parseAnswers(inspection.answers_json), [inspection.answers_json]);
  const answerEntries = Object.entries(answers);

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from("inspection-photos").getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="mt-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</h4>

      <div className="flex gap-4 text-xs mb-2">
        <span
          className={`font-medium ${inspection.walk_around_complete ? "text-green-700" : "text-gray-500"}`}
        >
          Walk-around: {inspection.walk_around_complete ? "Complete" : "Incomplete"}
        </span>
        <span
          className={`font-medium ${inspection.issues_found ? "text-red-700" : "text-green-700"}`}
        >
          Issues: {inspection.issues_found ? "Yes" : "None"}
        </span>
      </div>

      {inspection.issue_description && (
        <p className="text-sm text-gray-700 mb-2">{inspection.issue_description}</p>
      )}

      {answerEntries.length > 0 && (
        <div className="space-y-2">
          {answerEntries.map(([questionId, answer]) => (
            <div key={questionId} className="bg-gray-50 rounded-md px-3 py-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium text-gray-700">{answer.question_text}</span>
                <span className="text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">
                  {answer.question_type}
                </span>
              </div>

              {answer.question_type === "text" && answer.value != null && (
                <p className="text-sm text-gray-600">{String(answer.value)}</p>
              )}

              {answer.question_type === "checkbox" && (
                <span
                  className={`text-xs font-medium ${answer.value ? "text-green-700" : "text-red-700"}`}
                >
                  {answer.value ? "Yes" : "No"}
                </span>
              )}

              {answer.question_type === "photo" && answer.photos && answer.photos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {answer.photos.map((photo, i) => {
                    const url = getPhotoUrl(photo.storage_path);
                    return (
                      <div
                        key={i}
                        className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 bg-white cursor-pointer hover:opacity-80 transition"
                        onClick={() => onPhotoClick(url)}
                      >
                        <img
                          src={url}
                          alt={`${answer.question_text} photo`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {answerEntries.length === 0 && !inspection.issues_found && (
        <p className="text-xs text-gray-400 italic">No question answers recorded.</p>
      )}
    </div>
  );
}

function InspectionCard({
  workTracker,
  onPhotoClick,
}: {
  workTracker: WorkTrackerWithInspection;
  onPhotoClick: (url: string) => void;
}) {
  const wt = workTracker;

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-semibold text-sm text-gray-900">
          Bleacher #{wt.bleacher?.bleacher_number ?? "?"}
        </span>
        <span className="text-xs text-gray-400">•</span>
        <span className="text-xs text-gray-500">
          {wt.work_tracker_type?.display_name ?? "Unknown type"}
        </span>
        {wt.driver && (
          <>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">
              {wt.driver.first_name} {wt.driver.last_name}
            </span>
          </>
        )}
      </div>

      <div className="text-xs text-gray-500 mb-1">
        {wt.date ? new Date(wt.date).toLocaleDateString() : "No date"}
      </div>

      {wt.pre_inspection && (
        <InspectionSection
          label="Pre-Trip Inspection (Pickup)"
          inspection={wt.pre_inspection}
          onPhotoClick={onPhotoClick}
        />
      )}

      {wt.post_inspection && (
        <InspectionSection
          label="Post-Trip Inspection (Dropoff)"
          inspection={wt.post_inspection}
          onPhotoClick={onPhotoClick}
        />
      )}
    </div>
  );
}

// ─── Damage Report Card ───────────────────────────────────────────────────────

function DamageReportCard({ report, onClick }: { report: DamageReport; onClick: () => void }) {
  const isResolved = !!report.resolved_at;

  return (
    <div
      onClick={onClick}
      className={`border rounded-lg p-4 bg-white shadow-sm cursor-pointer hover:shadow-md transition ${
        isResolved ? "border-gray-200" : "border-red-300 bg-red-50/30"
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
          </div>

          <div className="flex gap-4 text-xs text-gray-500 mb-2">
            <span>Created {new Date(report.created_at).toLocaleDateString()}</span>
            {isResolved && (
              <span>Resolved {new Date(report.resolved_at!).toLocaleDateString()}</span>
            )}
          </div>

          <div className="flex gap-4 text-xs mb-2">
            <span
              className={`font-medium ${report.is_safe_to_sit ? "text-green-700" : "text-red-700"}`}
            >
              Safe to sit: {report.is_safe_to_sit ? "Yes" : "No"}
            </span>
            <span
              className={`font-medium ${report.is_safe_to_haul ? "text-green-700" : "text-red-700"}`}
            >
              Safe to haul: {report.is_safe_to_haul ? "Yes" : "No"}
            </span>
          </div>

          {report.note && <p className="text-sm text-gray-700 mb-2">{report.note}</p>}

          {report.maintenance_event && (
            <p className="text-xs text-gray-500">
              Linked to: <span className="font-medium">{report.maintenance_event.event_name}</span>
            </p>
          )}
        </div>

        {report.photos.length > 0 && (
          <div className="flex gap-2 flex-shrink-0">
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
