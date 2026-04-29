"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus, Calendar } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useQuarter } from "../../../_lib/hooks/useQuarters";
import { useSprint } from "../../../_lib/hooks/useSprints";
import { useTasksForSprint } from "../../../_lib/hooks/useTasks";
import { useFeaturesForQuarter } from "../../../_lib/hooks/useFeatures";
import { useRoadmapUsers, displayName } from "../../../_lib/hooks/useRoadmapUsers";
import { RoadmapHeader } from "../../../_lib/components/RoadmapHeader";
import { StatusPill } from "../../../_lib/components/StatusPill";
import { TaskModal } from "../../../_lib/components/TaskModal";
import { TaskMessageBadge } from "../../../_lib/components/TaskMessageBadge";
import { SubscriberAvatars } from "../../../_lib/components/SubscriberAvatars";
import { TASK_STATUS_META } from "../../../_lib/constants";
import { quarterLabel, sprintLabel } from "../../../_lib/types";
import { useRoadmapAccessLevel } from "../../../_lib/hooks/useRoadmapAccessLevel";
import { useRoadmapCurrentUserUuid } from "../../../_lib/hooks/useRoadmapCurrentUserUuid";
import { useAllTaskSubscriptionsMap } from "../../../_lib/hooks/useSubscriptions";

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
  const newTask = searchParams.get("new") === "task";

  const [developerFilter, setDeveloperFilter] = useState<string | "all" | "unassigned">("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const { quarter } = useQuarter(quarterId);
  const { sprint } = useSprint(sprintId);
  const { tasks } = useTasksForSprint(sprintId, showDeleted);
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

  const taskId = taskParam === "new" ? null : taskParam;
  const taskModalOpen = newTask || taskParam !== null;

  const closeTaskModal = () => router.push(baseUrl);

  return (
    <main className="p-6 max-w-6xl mx-auto">
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
          <PrimaryButton onClick={() => router.push(`${baseUrl}?new=task`)}>
            <Plus className="size-4" />
            New Task
          </PrimaryButton>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setDeveloperFilter("all")}
          className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${
            developerFilter === "all"
              ? "bg-darkBlue text-white border-darkBlue"
              : "bg-white border-gray-300 hover:bg-gray-50"
          }`}
        >
          All ({tasks.length})
        </button>
        <button
          type="button"
          onClick={() => setDeveloperFilter("unassigned")}
          className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${
            developerFilter === "unassigned"
              ? "bg-darkBlue text-white border-darkBlue"
              : "bg-white border-gray-300 hover:bg-gray-50"
          }`}
        >
          Unassigned ({tasks.filter((t) => !t.developer_uuid).length})
        </button>
        {assignedDevelopers.map(({ uuid, name }) => (
          <button
            key={uuid}
            type="button"
            onClick={() => setDeveloperFilter(uuid)}
            className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${
              developerFilter === uuid
                ? "bg-darkBlue text-white border-darkBlue"
                : "bg-white border-gray-300 hover:bg-gray-50"
            }`}
          >
            {name} ({tasks.filter((t) => t.developer_uuid === uuid).length})
          </button>
        ))}
        {isDeveloper && (
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className={`ml-auto px-3 py-1 rounded-full text-xs border cursor-pointer ${
              showDeleted
                ? "bg-red-100 text-red-700 border-red-300"
                : "bg-white border-gray-300 hover:bg-gray-50 text-gray-500"
            }`}
          >
            {showDeleted ? "Showing Deleted" : "Show Deleted"}
          </button>
        )}
      </div>

      {filteredTasks.length === 0 ? (
        <p className="text-sm text-gray-500 italic border border-dashed rounded p-6 text-center">
          {tasks.length === 0 ? "No tasks in this sprint yet." : "No tasks match this filter."}
        </p>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b">
                <th className="text-left px-3 py-2 font-medium">Title</th>
                <th className="text-left px-3 py-2 font-medium w-44">Status</th>
                <th className="text-left px-3 py-2 font-medium">Linked Feature</th>
                <th className="text-left px-3 py-2 font-medium w-28">Subscribers</th>
                <th className="text-left px-3 py-2 font-medium w-28">Created</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map((t) => {
                const meta = TASK_STATUS_META[t.status];
                const feature = t.feature_id ? featureMap.get(t.feature_id) : null;
                return (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`${baseUrl}?task=${t.id}`)}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-3 py-2">{t.title}</td>
                    <td className="px-3 py-2">
                      <StatusPill label={meta.label} hex={meta.hex} />
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {feature ? (
                        feature.title
                      ) : (
                        <span className="text-xs text-gray-400 italic">none</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <SubscriberAvatars
                        userUuids={subscriptionsMap.get(t.id) ?? []}
                        userMap={userMap}
                      />
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {t.created_at
                          ? new Date(t.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })
                          : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <TaskMessageBadge taskId={t.id} userUuid={userUuid} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TaskModal
        open={taskModalOpen}
        onClose={closeTaskModal}
        sprintId={sprintId}
        quarterId={quarterId}
        taskId={taskId}
      />
    </main>
  );
}
