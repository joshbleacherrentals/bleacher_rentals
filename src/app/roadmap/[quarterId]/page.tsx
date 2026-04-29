"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { Plus, Calendar, Pencil, Inbox } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useQuarter } from "../_lib/hooks/useQuarters";
import { useSprintsForQuarter } from "../_lib/hooks/useSprints";
import { useFeaturesForQuarter } from "../_lib/hooks/useFeatures";
import { RoadmapHeader } from "../_lib/components/RoadmapHeader";
import { StatusPill } from "../_lib/components/StatusPill";
import { FEATURE_STATUS_META } from "../_lib/constants";
import { FeatureModal } from "../_lib/components/FeatureModal";
import { QuarterFormModal } from "../_lib/components/QuarterFormModal";
import { SprintFormModal } from "../_lib/components/SprintFormModal";
import { quarterLabel, quarterDateRange, sprintLabel } from "../_lib/types";
import { useRoadmapAccessLevel } from "../_lib/hooks/useRoadmapAccessLevel";

function formatDateRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  try {
    // Parse as local time by appending T00:00:00 to avoid UTC midnight off-by-one
    const s = new Date(`${start}T00:00:00`);
    const e = new Date(`${end}T00:00:00`);
    return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export default function QuarterDetailPage() {
  const params = useParams<{ quarterId: string }>();
  const quarterId = params.quarterId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDeveloper, isLoading: accessLoading } = useRoadmapAccessLevel();

  useEffect(() => {
    if (!accessLoading && !isDeveloper) {
      router.replace("/roadmap/backlog");
    }
  }, [isDeveloper, accessLoading, router]);

  const featureParam = searchParams.get("feature");
  const newFeature = searchParams.get("new") === "feature";
  const editQuarterModal = searchParams.get("edit") === "quarter";
  const newSprint = searchParams.get("new") === "sprint";
  const editSprint = searchParams.get("editSprint");

  const { quarter } = useQuarter(quarterId);
  const { sprints } = useSprintsForQuarter(quarterId);
  const { features } = useFeaturesForQuarter(quarterId);

  const sprintMap = useMemo(() => new Map(sprints.map((s) => [s.id, s])), [sprints]);
  const editingSprint = useMemo(
    () => sprints.find((s) => s.id === editSprint) ?? null,
    [sprints, editSprint],
  );

  const baseUrl = `/roadmap/${quarterId}`;

  const closeFeatureModal = () => router.push(baseUrl);
  const closeSprintModal = () => router.push(baseUrl);
  const closeQuarterModal = () => router.push(baseUrl);

  const featureId = featureParam === "new" ? null : featureParam;
  const featureModalOpen = newFeature || featureParam !== null;

  return (
    <main className="p-6 max-w-6xl mx-auto">
      <RoadmapHeader
        crumbs={[
          { label: "Roadmap", href: "/roadmap" },
          { label: quarter ? quarterLabel(quarter.year, quarter.quarter) : "Quarter" },
        ]}
        description={quarter ? quarterDateRange(quarter.year, quarter.quarter) : undefined}
        rightSlot={
          <>
            <Link
              href="/roadmap/backlog"
              className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1 cursor-pointer"
            >
              <Inbox className="size-4" />
              Backlog
            </Link>
            <button
              type="button"
              onClick={() => router.push(`${baseUrl}?edit=quarter`)}
              className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1 cursor-pointer"
            >
              <Pencil className="size-4" />
              Edit Quarter
            </button>
          </>
        }
      />

      {/* Features section */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Features</h2>
          <PrimaryButton onClick={() => router.push(`${baseUrl}?new=feature`)}>
            <Plus className="size-4" />
            New Feature
          </PrimaryButton>
        </div>

        {features.length === 0 ? (
          <p className="text-sm text-gray-500 italic border border-dashed rounded p-6 text-center">
            No features yet for this quarter.
          </p>
        ) : (
          <div className="border rounded overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="border-b">
                  <th className="text-left px-3 py-2 font-medium">Title</th>
                  <th className="text-left px-3 py-2 font-medium w-44">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Sprint Labels</th>
                </tr>
              </thead>
              <tbody>
                {features.map((f) => {
                  const meta = FEATURE_STATUS_META[f.status];
                  return (
                    <tr
                      key={f.id}
                      onClick={() => router.push(`${baseUrl}?feature=${f.id}`)}
                      className="border-b hover:bg-gray-50 cursor-pointer"
                    >
                      <td className="px-3 py-2">{f.title}</td>
                      <td className="px-3 py-2">
                        <StatusPill label={meta.label} hex={meta.hex} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {f.sprint_ids.length === 0 ? (
                            <span className="text-xs text-gray-400 italic">none</span>
                          ) : (
                            f.sprint_ids.map((sid) => {
                              const s = sprintMap.get(sid);
                              if (!s) return null;
                              return (
                                <span
                                  key={sid}
                                  className="px-2 py-0.5 rounded bg-gray-100 text-xs text-gray-700"
                                >
                                  {sprintLabel(s.sprint_number)}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sprints section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Sprints</h2>
          <button
            type="button"
            onClick={() => router.push(`${baseUrl}?new=sprint`)}
            className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1 cursor-pointer"
          >
            <Plus className="size-4" />
            Add Sprint
          </button>
        </div>

        {sprints.length === 0 ? (
          <p className="text-sm text-gray-500 italic border border-dashed rounded p-6 text-center">
            No sprints yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {sprints.map((s) => {
              const pct = s.task_count ? Math.round((s.task_done_count / s.task_count) * 100) : 0;
              return (
                <div
                  key={s.id}
                  className="border rounded-lg p-4 flex flex-col hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between">
                    <Link
                      href={`${baseUrl}/sprint/${s.id}`}
                      className="font-semibold hover:text-darkBlue flex items-center gap-2"
                    >
                      {sprintLabel(s.sprint_number)}
                    </Link>
                    <button
                      type="button"
                      onClick={() => router.push(`${baseUrl}?editSprint=${s.id}`)}
                      className="text-xs text-gray-500 hover:text-darkBlue cursor-pointer"
                    >
                      Edit
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <Calendar className="size-3" />
                    {formatDateRange(s.start_date, s.end_date)}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 bg-gray-100 rounded flex-1 overflow-hidden">
                      <div className="h-full bg-greenAccent" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">
                      {s.task_done_count}/{s.task_count}
                    </span>
                  </div>
                  <Link
                    href={`${baseUrl}/sprint/${s.id}`}
                    className="text-sm text-darkBlue hover:underline mt-3"
                  >
                    Open →
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <FeatureModal
        open={featureModalOpen}
        onClose={closeFeatureModal}
        quarterId={quarterId}
        featureId={featureId}
      />

      <QuarterFormModal open={editQuarterModal} onClose={closeQuarterModal} existing={quarter} />

      <SprintFormModal
        open={newSprint || editSprint !== null}
        onClose={closeSprintModal}
        quarterId={quarterId}
        existing={editingSprint}
      />
    </main>
  );
}
