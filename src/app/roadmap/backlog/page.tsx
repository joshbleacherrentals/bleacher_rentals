"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, Calendar } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useBacklogTasks } from "../_lib/hooks/useBacklogTasks";
import { useAllSprintsMap } from "../_lib/hooks/useSprints";
import { RoadmapHeader } from "../_lib/components/RoadmapHeader";
import { StatusPill } from "../_lib/components/StatusPill";
import { TaskModal } from "../_lib/components/TaskModal";
import { TaskMessageBadge } from "../_lib/components/TaskMessageBadge";
import { SubscriberAvatars } from "../_lib/components/SubscriberAvatars";
import { useRoadmapCurrentUserUuid } from "../_lib/hooks/useRoadmapCurrentUserUuid";
import { useMySubscribedTaskIds, useAllTaskSubscriptionsMap } from "../_lib/hooks/useSubscriptions";
import { useRoadmapUsers } from "../_lib/hooks/useRoadmapUsers";
import { useRoadmapAccessLevel } from "../_lib/hooks/useRoadmapAccessLevel";

type FilterMode = "all" | "mine";
type StatusFilter = "all" | "in_progress" | "completed";

export default function BacklogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const ticketParam = searchParams.get("ticket");
  const newTicket = searchParams.get("new") === "ticket";

  const [filter, setFilter] = useState<FilterMode>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showDeleted, setShowDeleted] = useState(false);

  const { tasks, isLoading } = useBacklogTasks(showDeleted);
  const sprintsMap = useAllSprintsMap();
  const { userUuid } = useRoadmapCurrentUserUuid();
  const myTaskIds = useMySubscribedTaskIds(userUuid);
  const { isDeveloper } = useRoadmapAccessLevel();
  const subscriptionsMap = useAllTaskSubscriptionsMap();
  const { userMap } = useRoadmapUsers();

  function getStatusMeta(status: string, sprintId: string | null): { label: string; hex: string } {
    if (status === "in_progress") return { label: "In Progress", hex: "#7b9ee7" };
    if (status === "completed") return { label: "Completed", hex: "#86efac" };
    // to_do
    if (sprintId) {
      const sprintLabel = sprintsMap.get(sprintId);
      return { label: `Assigned to ${sprintLabel ?? "Sprint"}`, hex: "#bfdbfe" };
    }
    return { label: "Pending", hex: "#e5e7eb" };
  }

  const visibleTasks = useMemo(() => {
    let list = filter === "mine" ? tasks.filter((t) => myTaskIds.has(t.id)) : tasks;
    if (statusFilter === "in_progress") {
      list = list.filter((t) => t.status === "in_progress" || !!t.sprint_id);
    } else if (statusFilter === "completed") {
      list = list.filter((t) => t.status === "completed");
    }
    return list;
  }, [tasks, filter, statusFilter, myTaskIds]);

  const baseUrl = "/roadmap/backlog";
  const ticketId = ticketParam === "new" ? null : ticketParam;
  const ticketModalOpen = newTicket || ticketParam !== null;
  const closeTicketModal = () => router.push(baseUrl);

  return (
    <main className="p-6 max-w-5xl mx-auto">
      <RoadmapHeader
        crumbs={[{ label: "Roadmap", href: "/roadmap" }, { label: "Backlog" }]}
        description="Submit ideas, bugs, and feature requests. Assign to a sprint when ready."
        rightSlot={
          <PrimaryButton onClick={() => router.push(`${baseUrl}?new=ticket`)}>
            <Plus className="size-4" />
            Submit Ticket
          </PrimaryButton>
        }
      />

      <div className="flex items-center gap-2 mb-4">
        {(["all", "mine"] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setFilter(mode)}
            className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${
              filter === mode
                ? "bg-darkBlue text-white border-darkBlue"
                : "bg-white border-gray-300 hover:bg-gray-50"
            }`}
          >
            {mode === "all" ? "All" : "My Tickets"}
          </button>
        ))}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="ml-auto px-3 py-1 rounded border border-gray-300 text-xs bg-white cursor-pointer focus:outline-none focus:ring-1 focus:ring-darkBlue"
        >
          <option value="all">All Statuses</option>
          <option value="in_progress">In Progress / Assigned</option>
          <option value="completed">Completed</option>
        </select>
        {isDeveloper && (
          <button
            type="button"
            onClick={() => setShowDeleted((v) => !v)}
            className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${
              showDeleted
                ? "bg-red-100 text-red-700 border-red-300"
                : "bg-white border-gray-300 hover:bg-gray-50 text-gray-500"
            }`}
          >
            {showDeleted ? "Showing Deleted" : "Show Deleted"}
          </button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading backlog...</p>
      ) : visibleTasks.length === 0 ? (
        <p className="text-sm text-gray-500 italic border border-dashed rounded p-6 text-center">
          {filter === "mine"
            ? "You're not subscribed to any backlog tickets."
            : tasks.length === 0
              ? "No backlog tickets yet — submit the first one."
              : "No tickets match this filter."}
        </p>
      ) : (
        <div className="border rounded overflow-hidden">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b">
                <th className="text-left px-3 py-2 font-medium">Title</th>
                <th className="text-left px-3 py-2 font-medium w-36">Status</th>
                <th className="text-left px-3 py-2 font-medium w-28">Submitted</th>
                <th className="text-left px-3 py-2 font-medium w-28">Subscribers</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((t) => {
                const meta = getStatusMeta(t.status, t.sprint_id);
                return (
                  <tr
                    key={t.id}
                    onClick={() => router.push(`${baseUrl}?ticket=${t.id}`)}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-3 py-2">{t.title}</td>
                    <td className="px-3 py-2">
                      <StatusPill label={meta.label} hex={meta.hex} />
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
                      <SubscriberAvatars
                        userUuids={subscriptionsMap.get(t.id) ?? []}
                        userMap={userMap}
                      />
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
        open={ticketModalOpen}
        onClose={closeTicketModal}
        sprintId={null}
        quarterId={null}
        taskId={ticketId}
      />
    </main>
  );
}
