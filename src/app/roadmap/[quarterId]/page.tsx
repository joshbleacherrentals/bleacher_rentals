"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Calendar, Pencil, Inbox, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useQuarter } from "../_lib/hooks/useQuarters";
import { useSprintsForQuarter } from "../_lib/hooks/useSprints";
import { useFeaturesForQuarter } from "../_lib/hooks/useFeatures";
import { PageHeaderWithBreadCrumbs as RoadmapHeader } from "@/components/PageHeaderWithBreadCrumbs";
import { StatusPill } from "../_lib/components/StatusPill";
import {
  DataTable,
  Row,
  Cell,
  TitleCell,
  DeletedStatusCell,
} from "../_lib/components/list/DataTable";
import { EmptyState, Panel, SectionHeading } from "../_lib/components/list/Panel";
import { FilterPill } from "../_lib/components/list/FilterPill";
import { FEATURE_STATUS_META } from "../_lib/constants";
import { FeatureModal } from "../_lib/components/FeatureModal";
import { QuarterFormModal } from "../_lib/components/QuarterFormModal";
import { SprintFormModal } from "../_lib/components/SprintFormModal";
import { quarterLabel, quarterDateRange, sprintLabel } from "../_lib/types";
import { useRoadmapAccessLevel } from "../_lib/hooks/useRoadmapAccessLevel";
import { useDraftCreator } from "../_lib/hooks/useDraftCreator";
import { createDraftFeature } from "../_lib/db/features";

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
  const editQuarterModal = searchParams.get("edit") === "quarter";
  const newSprint = searchParams.get("new") === "sprint";
  const editSprint = searchParams.get("editSprint");

  const [showDeletedFeatures, setShowDeletedFeatures] = useState(false);

  const { quarter } = useQuarter(quarterId);
  const { sprints } = useSprintsForQuarter(quarterId);
  const { features } = useFeaturesForQuarter(quarterId, showDeletedFeatures);

  const sprintMap = useMemo(() => new Map(sprints.map((s) => [s.id, s])), [sprints]);
  const editingSprint = useMemo(
    () => sprints.find((s) => s.id === editSprint) ?? null,
    [sprints, editSprint],
  );

  const baseUrl = `/roadmap/${quarterId}`;

  const closeFeatureModal = () => router.push(baseUrl);
  const closeSprintModal = () => router.push(baseUrl);
  const closeQuarterModal = () => router.push(baseUrl);

  const featureId = featureParam;
  const featureModalOpen = featureParam !== null;

  // "+ New Feature" inserts the row first, then opens its modal — everything typed
  // from that point on autosaves. `replace` keeps the empty draft out of history.
  const openFeature = useCallback(
    (id: string) => router.replace(`${baseUrl}?feature=${id}`),
    [router, baseUrl],
  );
  const { createDraft: createFeatureDraft, isCreating: creatingFeature } = useDraftCreator({
    create: () => createDraftFeature(quarterId),
    onCreated: openFeature,
    errorMessage: "Couldn't create the feature",
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
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
      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <SectionHeading>Features</SectionHeading>
          <div className="flex items-center gap-2">
            <FilterPill
              tone="danger"
              active={showDeletedFeatures}
              onClick={() => setShowDeletedFeatures((v) => !v)}
            >
              {showDeletedFeatures ? "Showing Deleted" : "Show Deleted"}
            </FilterPill>
            <PrimaryButton onClick={createFeatureDraft} disabled={creatingFeature}>
              {creatingFeature ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Plus className="size-4" />
              )}
              New Feature
            </PrimaryButton>
          </div>
        </div>

        {features.length === 0 ? (
          <EmptyState>
            {showDeletedFeatures ? "No deleted features." : "No features yet for this quarter."}
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              { label: "Title" },
              { label: "Status", className: "w-44" },
              { label: "Sprint Labels" },
            ]}
          >
            {features.map((f) => {
              const meta = FEATURE_STATUS_META[f.status];
              const isDeleted = !!f.deleted_at;
              return (
                <Row
                  key={f.id}
                  deleted={isDeleted}
                  onClick={() => router.push(`${baseUrl}?feature=${f.id}`)}
                >
                  <TitleCell title={f.title} fallback="Untitled feature" deleted={isDeleted} />
                  {isDeleted ? (
                    <DeletedStatusCell />
                  ) : (
                    <Cell>
                      <StatusPill label={meta.label} tone={meta.tone} />
                    </Cell>
                  )}
                  <Cell>
                    <div className="flex flex-wrap gap-1">
                      {f.sprint_ids.length === 0 ? (
                        <span className="text-xs text-rm-ink-faint italic">none</span>
                      ) : (
                        f.sprint_ids.map((sid) => {
                          const s = sprintMap.get(sid);
                          if (!s) return null;
                          return (
                            <span
                              key={sid}
                              className="rounded-md bg-rm-sunken px-2 py-0.5 text-xs whitespace-nowrap text-rm-ink-muted"
                            >
                              {sprintLabel(s.sprint_number)}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </Cell>
                </Row>
              );
            })}
          </DataTable>
        )}
      </section>

      {/* Sprints section */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionHeading>Sprints</SectionHeading>
          <FilterPill onClick={() => router.push(`${baseUrl}?new=sprint`)}>
            <span className="flex items-center gap-1">
              <Plus className="size-3.5" />
              Add Sprint
            </span>
          </FilterPill>
        </div>

        {sprints.length === 0 ? (
          <EmptyState>No sprints yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sprints.map((s) => {
              const pct = s.task_count ? Math.round((s.task_done_count / s.task_count) * 100) : 0;
              return (
                <Panel
                  key={s.id}
                  interactive
                  className="flex flex-col p-4"
                  onClick={() => router.push(`${baseUrl}/sprint/${s.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <Link
                      href={`${baseUrl}/sprint/${s.id}`}
                      className="text-[15px] font-semibold text-rm-ink transition-colors hover:text-rm-accent"
                    >
                      {sprintLabel(s.sprint_number)}
                    </Link>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`${baseUrl}?editSprint=${s.id}`);
                      }}
                      className="cursor-pointer rounded-md px-1.5 py-0.5 text-xs text-rm-ink-faint transition-colors hover:bg-rm-sunken hover:text-rm-accent"
                    >
                      Edit
                    </button>
                  </div>

                  <p className="mt-1 flex items-center gap-1 text-xs text-rm-ink-muted">
                    <Calendar className="size-3" />
                    {formatDateRange(s.start_date, s.end_date)}
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <div
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-rm-sunken"
                      role="progressbar"
                      aria-valuenow={pct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${sprintLabel(s.sprint_number)} progress`}
                    >
                      <div
                        className="h-full rounded-full bg-rm-success-ink/70 transition-[width] duration-500 motion-reduce:transition-none"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-rm-ink-muted">
                      {s.task_done_count}/{s.task_count}
                    </span>
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

      <FeatureModal open={featureModalOpen} onClose={closeFeatureModal} featureId={featureId} />

      <QuarterFormModal open={editQuarterModal} onClose={closeQuarterModal} existing={quarter} />

      <SprintFormModal
        open={newSprint || editSprint !== null}
        onClose={closeSprintModal}
        quarterId={quarterId}
        existing={editingSprint}
      />
    </div>
  );
}
