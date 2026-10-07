"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Plus, Calendar, Loader2 } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useBacklogTasks } from "../_lib/hooks/useBacklogTasks";
import { useAllSprintsMap } from "../_lib/hooks/useSprints";
import { PageHeaderWithBreadCrumbs as RoadmapHeader } from "@/components/PageHeaderWithBreadCrumbs";
import { StatusPill, type StatusTone } from "../_lib/components/StatusPill";
import {
  DataTable,
  Row,
  Cell,
  TitleCell,
  DeletedStatusCell,
} from "../_lib/components/list/DataTable";
import { EmptyState } from "../_lib/components/list/Panel";
import { FilterPill } from "../_lib/components/list/FilterPill";
import { TaskModal } from "../_lib/components/TaskModal";
import { TaskMessageBadge } from "../_lib/components/TaskMessageBadge";
import { SubscriberAvatars } from "../_lib/components/SubscriberAvatars";
import { useRoadmapCurrentUserUuid } from "../_lib/hooks/useRoadmapCurrentUserUuid";
import { useMySubscribedTaskIds, useAllTaskSubscriptionsMap } from "../_lib/hooks/useSubscriptions";
import { useRoadmapUsers } from "../_lib/hooks/useRoadmapUsers";
import { useRoadmapAccessLevel } from "../_lib/hooks/useRoadmapAccessLevel";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canEditRoadmapTasks } from "../_lib/util/canEditRoadmapTasks";
import { useDraftCreator } from "../_lib/hooks/useDraftCreator";
import { createDraftTask } from "../_lib/db/tasks";

type FilterMode = "all" | "mine";

export default function BacklogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const ticketParam = searchParams.get("ticket");

  const [filter, setFilter] = useState<FilterMode>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);

  const { tasks, isLoading } = useBacklogTasks(showDeleted);
  const sprintsMap = useAllSprintsMap();
  const { userUuid } = useRoadmapCurrentUserUuid();
  const myTaskIds = useMySubscribedTaskIds(userUuid);
  const { isDeveloper } = useRoadmapAccessLevel();
  const { isAccountManager } = useTeamPermissions();
  const canEditTasks = canEditRoadmapTasks(isDeveloper, isAccountManager);
  const subscriptionsMap = useAllTaskSubscriptionsMap();
  const { userMap } = useRoadmapUsers();

  function getStatusMeta(
    status: string,
    sprintId: string | null,
  ): { label: string; tone: StatusTone } {
    if (status === "in_progress") return { label: "In Progress", tone: "info" };
    if (status === "completed") return { label: "Completed", tone: "success" };
    // to_do — an assigned ticket is further along than a pending one, so it keeps
    // the informational tone while "Pending" stays neutral.
    if (sprintId) {
      const sprintLabel = sprintsMap.get(sprintId);
      return { label: `Assigned to ${sprintLabel ?? "Sprint"}`, tone: "info" };
    }
    return { label: "Pending", tone: "neutral" };
  }

  const visibleTasks = useMemo(() => {
    let list = filter === "mine" ? tasks.filter((t) => myTaskIds.has(t.id)) : tasks;
    if (!showCompleted) {
      list = list.filter((t) => t.status !== "completed");
    }
    return list;
  }, [tasks, filter, showCompleted, myTaskIds]);

  const baseUrl = "/roadmap/backlog";
  const ticketId = ticketParam;
  const ticketModalOpen = ticketParam !== null;
  const closeTicketModal = () => router.push(baseUrl);

  // "+ Submit Ticket" inserts the row first, then opens its modal. Subscribers are only
  // notified once the draft gets a title — see `announceTaskCreated`.
  const openTicket = useCallback(
    (id: string) => router.replace(`${baseUrl}?ticket=${id}`),
    [router],
  );
  const { createDraft: createTicketDraft, isCreating: creatingTicket } = useDraftCreator({
    create: () => createDraftTask({ sprintId: null, isBacklog: true, createdByUserUuid: userUuid }),
    onCreated: openTicket,
    errorMessage: "Couldn't create the ticket",
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <RoadmapHeader
        crumbs={[{ label: "Roadmap", href: "/roadmap" }, { label: "Backlog" }]}
        description="Submit ideas, bugs, and feature requests. Assign to a sprint when ready."
        rightSlot={
          canEditTasks ? (
            <PrimaryButton onClick={createTicketDraft} disabled={creatingTicket}>
              {creatingTicket ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Plus className="size-4" />
              )}
              Submit Ticket
            </PrimaryButton>
          ) : undefined
        }
      />

      <div className="mb-4 flex items-center gap-2">
        {(["all", "mine"] as FilterMode[]).map((mode) => (
          <FilterPill key={mode} active={filter === mode} onClick={() => setFilter(mode)}>
            {mode === "all" ? "All" : "My Tickets"}
          </FilterPill>
        ))}
        <FilterPill
          className="ml-auto"
          active={showCompleted}
          onClick={() => setShowCompleted((v) => !v)}
        >
          {showCompleted ? "Hiding Completed" : "Show Completed"}
        </FilterPill>
        {isDeveloper && (
          <FilterPill tone="danger" active={showDeleted} onClick={() => setShowDeleted((v) => !v)}>
            {showDeleted ? "Showing Deleted" : "Show Deleted"}
          </FilterPill>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-rm-ink-muted">Loading backlog…</p>
      ) : visibleTasks.length === 0 ? (
        <EmptyState>
          {filter === "mine"
            ? "You're not subscribed to any backlog tickets."
            : tasks.length === 0
              ? "No backlog tickets yet — submit the first one."
              : "No tickets match this filter."}
        </EmptyState>
      ) : (
        <DataTable
          headers={[
            { label: "Title" },
            { label: "Status", className: "w-36" },
            { label: "Submitted", className: "w-28" },
            { label: "Subscribers", className: "w-28" },
            { label: "", className: "w-10" },
          ]}
        >
          {visibleTasks.map((t) => {
            const meta = getStatusMeta(t.status, t.sprint_id);
            const isDeleted = !!t.deleted_at;
            return (
              <Row
                key={t.id}
                deleted={isDeleted}
                onClick={() => router.push(`${baseUrl}?ticket=${t.id}`)}
              >
                <TitleCell title={t.title} fallback="Untitled ticket" deleted={isDeleted} />
                {isDeleted ? (
                  <DeletedStatusCell />
                ) : (
                  <Cell>
                    <StatusPill label={meta.label} tone={meta.tone} />
                  </Cell>
                )}
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
                <Cell>
                  {!isDeleted && (
                    <SubscriberAvatars
                      userUuids={subscriptionsMap.get(t.id) ?? []}
                      userMap={userMap}
                    />
                  )}
                </Cell>
                <Cell>{!isDeleted && <TaskMessageBadge taskId={t.id} userUuid={userUuid} />}</Cell>
              </Row>
            );
          })}
        </DataTable>
      )}

      <TaskModal
        open={ticketModalOpen}
        onClose={closeTicketModal}
        quarterId={null}
        taskId={ticketId}
        readOnly={!canEditTasks}
      />
    </div>
  );
}
