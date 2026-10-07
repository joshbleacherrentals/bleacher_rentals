"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Calendar, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useQuarter } from "../../../_lib/hooks/useQuarters";
import { useSprint } from "../../../_lib/hooks/useSprints";
import { useTasksForSprint } from "../../../_lib/hooks/useTasks";
import { useFeaturesForQuarter } from "../../../_lib/hooks/useFeatures";
import { useRoadmapUsers, displayName } from "../../../_lib/hooks/useRoadmapUsers";
import { PageHeaderWithBreadCrumbs as RoadmapHeader } from "@/components/PageHeaderWithBreadCrumbs";
import { StatusPill } from "../../../_lib/components/StatusPill";
import {
  DataTable,
  Row,
  Cell,
  TitleCell,
  DeletedStatusCell,
} from "../../../_lib/components/list/DataTable";
import { EmptyState } from "../../../_lib/components/list/Panel";
import { FilterPill } from "../../../_lib/components/list/FilterPill";
import { TaskModal } from "../../../_lib/components/TaskModal";
import { TaskMessageBadge } from "../../../_lib/components/TaskMessageBadge";
import { SubscriberAvatars } from "../../../_lib/components/SubscriberAvatars";
import { TASK_STATUS_META } from "../../../_lib/constants";
import { quarterLabel, sprintLabel } from "../../../_lib/types";
import { useRoadmapAccessLevel } from "../../../_lib/hooks/useRoadmapAccessLevel";
import { useRoadmapCurrentUserUuid } from "../../../_lib/hooks/useRoadmapCurrentUserUuid";
import { useAllTaskSubscriptionsMap } from "../../../_lib/hooks/useSubscriptions";
import { useDraftCreator } from "../../../_lib/hooks/useDraftCreator";
import { createDraftTask } from "../../../_lib/db/tasks";

function formatDateRange(start: string, end: string) {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  try {
    return `${new Date(`${start}T00:00:00`).toLocaleDateString(undefined, opts)} – ${new Date(
      `${end}T00:00:00`,
    ).toLocaleDateString(undefined, opts)}`;
  } catch {
    return `${start} – ${end}`;
  }
}

export default function SprintDetailPage() {
  const params = useParams<{ quarterId: string; sprintId: string }>();
  const quarterId = params.quarterId;
  const sprintId = params.sprintId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isDeveloper, isLoading: accessLoading } = useRoadmapAccessLevel();
  const { userUuid } = useRoadmapCurrentUserUuid();

  useEffect(() => {
    if (!accessLoading && !isDeveloper) {
      router.replace("/roadmap/backlog");
    }
  }, [isDeveloper, accessLoading, router]);

  const taskParam = searchParams.get("task");

  const [developerFilter, setDeveloperFilter] = useState<string | "all" | "unassigned">("all");
  const [showDeleted, setShowDeleted] = useState(false);
  // Off by default; on, the list is just what is left to do.
  const [hideCompleted, setHideCompleted] = useState(false);

  const { quarter } = useQuarter(quarterId);
  const { sprint } = useSprint(sprintId);
  const { tasks: allTasks } = useTasksForSprint(sprintId, showDeleted);
  // Everything below (developer pills, their counts, the table) works from what is visible.
  const tasks = useMemo(
    () => (hideCompleted ? allTasks.filter((t) => t.status !== "completed") : allTasks),
    [allTasks, hideCompleted],
  );
  const { features } = useFeaturesForQuarter(quarterId);
  const { userMap } = useRoadmapUsers();
  const subscriptionsMap = useAllTaskSubscriptionsMap();

  const featureMap = useMemo(() => new Map(features.map((f) => [f.id, f])), [features]);

  // Developers who have at least one task in this sprint
  const assignedDevelopers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of tasks) {
      if (t.developer_uuid && !seen.has(t.developer_uuid)) {
        seen.set(t.developer_uuid, displayName(userMap.get(t.developer_uuid)));
      }
    }
    return Array.from(seen.entries()).map(([uuid, name]) => ({ uuid, name }));
  }, [tasks, userMap]);

  const STATUS_ORDER: Record<string, number> = { completed: 0, in_progress: 1, to_do: 2 };

  const filteredTasks = useMemo(() => {
    let list = tasks;
    if (developerFilter === "unassigned") {
      list = list.filter((t) => !t.developer_uuid);
    } else if (developerFilter !== "all") {
      list = list.filter((t) => t.developer_uuid === developerFilter);
    }
    return [...list].sort((a, b) => {
      const statusDiff = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2);
      if (statusDiff !== 0) return statusDiff;
      return (a.created_at ?? "").localeCompare(b.created_at ?? "");
    });
  }, [tasks, developerFilter]);

  const baseUrl = `/roadmap/${quarterId}/sprint/${sprintId}`;
  const quarterUrl = `/roadmap/${quarterId}`;

  const taskId = taskParam;
  const taskModalOpen = taskParam !== null;

  const closeTaskModal = () => router.push(baseUrl);

  // "+ New Task" inserts the row first, then opens its modal — from there on every
  // edit autosaves. `replace` keeps the empty draft out of browser history.
  const openTask = useCallback(
    (id: string) => router.replace(`${baseUrl}?task=${id}`),
    [router, baseUrl],
  );
  const { createDraft: createTaskDraft, isCreating: creatingTask } = useDraftCreator({
    create: () => createDraftTask({ sprintId, isBacklog: false, createdByUserUuid: userUuid }),
    onCreated: openTask,
    errorMessage: "Couldn't create the task",
  });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <RoadmapHeader
        crumbs={[
          { label: "Roadmap", href: "/roadmap" },
          {
            label: quarter ? quarterLabel(quarter.year, quarter.quarter) : "Quarter",
            href: quarterUrl,
          },
          { label: sprint ? sprintLabel(sprint.sprint_number) : "Sprint" },
        ]}
        description={sprint ? formatDateRange(sprint.start_date, sprint.end_date) : undefined}
        rightSlot={
          <PrimaryButton onClick={createTaskDraft} disabled={creatingTask}>
            {creatingTask ? (
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus className="size-4" />
            )}
            New Task
          </PrimaryButton>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPill active={developerFilter === "all"} onClick={() => setDeveloperFilter("all")}>
          All ({tasks.length})
        </FilterPill>
        <FilterPill
          active={developerFilter === "unassigned"}
          onClick={() => setDeveloperFilter("unassigned")}
        >
          Unassigned ({tasks.filter((t) => !t.developer_uuid).length})
        </FilterPill>
        {assignedDevelopers.map(({ uuid, name }) => (
          <FilterPill
            key={uuid}
            active={developerFilter === uuid}
            onClick={() => setDeveloperFilter(uuid)}
          >
            {name} ({tasks.filter((t) => t.developer_uuid === uuid).length})
          </FilterPill>
        ))}
        <FilterPill
          className="ml-auto"
          active={hideCompleted}
          onClick={() => setHideCompleted((v) => !v)}
        >
          {hideCompleted ? "Completed Hidden" : "Hide Completed"}
        </FilterPill>
        {isDeveloper && (
          <FilterPill tone="danger" active={showDeleted} onClick={() => setShowDeleted((v) => !v)}>
            {showDeleted ? "Showing Deleted" : "Show Deleted"}
          </FilterPill>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState>
          {tasks.length === 0
            ? showDeleted
              ? "No deleted tasks."
              : hideCompleted && allTasks.length > 0
                ? "Nothing left to do — every task is completed."
                : "No tasks in this sprint yet."
            : "No tasks match this filter."}
        </EmptyState>
      ) : (
        <DataTable
          headers={[
            { label: "Title" },
            { label: "Status", className: "w-44" },
            { label: "Linked Feature" },
            { label: "Subscribers", className: "w-28" },
            { label: "Created", className: "w-28" },
            { label: "", className: "w-10" },
          ]}
        >
          {filteredTasks.map((t) => {
            const meta = TASK_STATUS_META[t.status];
            const feature = t.feature_id ? featureMap.get(t.feature_id) : null;
            const isDeleted = !!t.deleted_at;
            return (
              <Row
                key={t.id}
                deleted={isDeleted}
                onClick={() => router.push(`${baseUrl}?task=${t.id}`)}
              >
                <TitleCell title={t.title} fallback="Untitled task" deleted={isDeleted} />
                {isDeleted ? (
                  <DeletedStatusCell />
                ) : (
                  <Cell>
                    <StatusPill label={meta.label} tone={meta.tone} />
                  </Cell>
                )}
                <Cell className="text-rm-ink-muted">
                  {feature ? (
                    feature.title || "Untitled feature"
                  ) : (
                    <span className="text-xs text-rm-ink-faint italic">none</span>
                  )}
                </Cell>
                <Cell>
                  {!isDeleted && (
                    <SubscriberAvatars
                      userUuids={subscriptionsMap.get(t.id) ?? []}
                      userMap={userMap}
                    />
                  )}
                </Cell>
                <Cell className="text-xs text-rm-ink-muted">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {t.created_at
                      ? new Date(t.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "—"}
                  </span>
                </Cell>
                <Cell>{!isDeleted && <TaskMessageBadge taskId={t.id} userUuid={userUuid} />}</Cell>
              </Row>
            );
          })}
        </DataTable>
      )}

      <TaskModal
        open={taskModalOpen}
        onClose={closeTaskModal}
        quarterId={quarterId}
        taskId={taskId}
      />
    </div>
  );
}
