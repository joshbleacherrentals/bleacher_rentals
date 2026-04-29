"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Dropdown } from "@/components/DropDown";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { RichTextEditor } from "./RichTextEditor";
import { AttachmentList } from "./AttachmentList";
import { TaskChat } from "./TaskChat";
import { useTask } from "../hooks/useTasks";
import { useFeaturesForQuarter } from "../hooks/useFeatures";
import { useQuarters } from "../hooks/useQuarters";
import { useSprint, useSprintsForQuarter } from "../hooks/useSprints";
import { useRoadmapCurrentUserUuid } from "../hooks/useRoadmapCurrentUserUuid";
import { useRoadmapAccessLevel } from "../hooks/useRoadmapAccessLevel";
import { useRoadmapDevelopers } from "../hooks/useRoadmapDevelopers";
import { saveTask, deleteTask, restoreTask } from "../db/tasks";
import { subscribeToTask } from "../db/subscriptions";
import { sendTaskMessage } from "../db/messages";
import { useRoadmapUsers, displayName } from "../hooks/useRoadmapUsers";
import { useSubscriptionsForTask } from "../hooks/useSubscriptions";
import { DEFAULT_TASK_STATUS, TASK_STATUS_OPTIONS } from "../constants";
import type { TaskStatus } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  sprintId: string | null;
  quarterId: string | null;
  taskId: string | null;
};

export function TaskModal({ open, onClose, sprintId, quarterId, taskId }: Props) {
  const { task } = useTask(taskId);
  const { userUuid } = useRoadmapCurrentUserUuid();
  const { isDeveloper } = useRoadmapAccessLevel();
  const developers = useRoadmapDevelopers();
  const { userMap } = useRoadmapUsers();
  const { subscriptions } = useSubscriptionsForTask(taskId);
  const { quarters } = useQuarters();
  // Look up the quarter for an existing task's sprint
  const { sprint: taskSprint } = useSprint(task?.sprint_id ?? null);

  const [selectedQuarterId, setSelectedQuarterId] = useState(quarterId ?? "");
  const [selectedSprintId, setSelectedSprintId] = useState(sprintId ?? "");
  const [isBacklog, setIsBacklog] = useState(true);

  const { sprints } = useSprintsForQuarter(selectedQuarterId || null);
  const { features } = useFeaturesForQuarter(selectedQuarterId || null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(DEFAULT_TASK_STATUS);
  const [featureId, setFeatureId] = useState<string | "">("");
  const [developerUuid, setDeveloperUuid] = useState<string | "">("");
  const [submitting, setSubmitting] = useState(false);

  const isBacklogContext = !sprintId && !task?.sprint_id;

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? DEFAULT_TASK_STATUS);
    setFeatureId(task?.feature_id ?? "");
    setDeveloperUuid(task?.developer_uuid ?? "");
    // For existing tasks: derive quarter from the task's sprint; fall back to the prop
    const derivedQuarterId = taskSprint?.quarter_id ?? quarterId ?? "";
    setSelectedQuarterId(derivedQuarterId);
    setSelectedSprintId(task?.sprint_id ?? sprintId ?? "");
    setIsBacklog(task ? task.is_backlog : isBacklogContext);
  }, [open, task, taskSprint]);

  const handleSave = async () => {
    if (!title.trim()) {
      createErrorToast(["Title is required"]);
      return;
    }
    setSubmitting(true);
    try {
      // Non-developers always submit as backlog tickets with to_do status
      const effectiveIsBacklog = !isDeveloper ? true : isBacklog;
      const effectiveStatus: TaskStatus = !isDeveloper ? "to_do" : status;
      const effectiveSprintId = !isDeveloper ? null : selectedSprintId || null;

      const savedId = await saveTask({
        taskId,
        sprintId: effectiveSprintId,
        featureId: featureId || null,
        title: title.trim(),
        description: description.trim() ? description : null,
        status: effectiveStatus,
        createdByUserUuid: userUuid,
        isBacklog: effectiveIsBacklog,
        developerUuid: isDeveloper ? developerUuid || null : null,
      });
      // Auto-subscribe the creator on new tickets
      if (!taskId && userUuid) {
        await subscribeToTask(savedId, userUuid);
      }

      // Post a system message and notify subscribers
      if (userUuid) {
        const actorName = displayName(userMap.get(userUuid));
        const messageBody = taskId
          ? `${actorName} made changes to the ticket.`
          : `${actorName} created a ticket.`;
        await sendTaskMessage({ taskId: savedId, userUuid, body: messageBody });

        const recipientUuids = subscriptions
          .map((s) => s.user_uuid)
          .filter((uuid): uuid is string => !!uuid && uuid !== userUuid);
        if (recipientUuids.length > 0) {
          fetch("/api/roadmap/task-message-notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              taskId: savedId,
              senderUserUuid: userUuid,
              senderName: actorName,
              messageBody,
            }),
          }).catch(() => {});
        }
      }

      createSuccessToast(["Task saved"]);
      onClose();
    } catch (err: any) {
      createErrorToast(["Save failed", err.message ?? String(err)]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!taskId) return;
    if (!confirm("Delete this task?")) return;
    setSubmitting(true);
    try {
      await deleteTask(taskId);
      createSuccessToast(["Task deleted"]);
      onClose();
    } catch (err: any) {
      createErrorToast(["Delete failed", err.message ?? String(err)]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRestore = async () => {
    if (!taskId) return;
    setSubmitting(true);
    try {
      await restoreTask(taskId);
      createSuccessToast(["Task restored"]);
      onClose();
    } catch (err: any) {
      createErrorToast(["Restore failed", err.message ?? String(err)]);
    } finally {
      setSubmitting(false);
    }
  };

  const quarterOptions = [
    { label: "(none)", value: "" },
    ...quarters.map((q) => ({ label: `Q${q.quarter} ${q.year}`, value: q.id })),
  ];

  const sprintOptions = [
    { label: "(none)", value: "" },
    ...sprints.map((s) => ({ label: `Sprint ${s.sprint_number}`, value: s.id })),
  ];

  const featureOptions = [
    { label: "(none)", value: "" },
    ...features.map((f) => ({ label: f.title, value: f.id })),
  ];

  const developerOptions = [
    { label: "(unassigned)", value: "" },
    ...developers.map((d) => ({ label: d.label, value: d.userUuid })),
  ];

  const modalTitle = taskId
    ? isBacklogContext
      ? "Edit Backlog Ticket"
      : "Edit Task"
    : isBacklogContext
      ? "Submit a Backlog Ticket"
      : "New Task";

  const showChat = !!taskId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      size={showChat ? "2xl" : "lg"}
      contentClassName={showChat ? "overflow-hidden flex flex-col" : undefined}
      footer={
        <>
          {taskId &&
            isDeveloper &&
            (task?.deleted_at ? (
              <PrimaryButton
                className="bg-green-700 hover:bg-green-800"
                loading={submitting}
                onClick={handleRestore}
              >
                Restore
              </PrimaryButton>
            ) : (
              <PrimaryButton
                className="bg-red-700 hover:bg-red-800"
                loading={submitting}
                onClick={handleDelete}
              >
                Delete
              </PrimaryButton>
            ))}
          <PrimaryButton loading={submitting} loadingText="Saving..." onClick={handleSave}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <div className={`flex gap-6 ${showChat ? "flex-1 min-h-0 overflow-hidden" : ""}`}>
        {/* Left: form */}
        <div className={`flex-1 space-y-4 min-w-0 ${showChat ? "overflow-y-auto pr-1" : ""}`}>
          <label className="block text-sm">
            <span className="font-medium">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isBacklog ? "Short summary of the request" : "What needs doing?"}
              className="mt-1 w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-greenAccent"
            />
          </label>

          {isDeveloper ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-sm font-medium block mb-1">Status</span>
                  <Dropdown
                    options={TASK_STATUS_OPTIONS}
                    selected={status}
                    onSelect={(v) => setStatus(v as TaskStatus)}
                    placeholder="Select Status"
                  />
                </div>
                <div>
                  <span className="text-sm font-medium block mb-1">Linked feature</span>
                  <Dropdown
                    options={featureOptions}
                    selected={featureId}
                    onSelect={(v) => setFeatureId(v)}
                    placeholder="(none)"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-sm font-medium block mb-1">Quarter</span>
                  <Dropdown
                    options={quarterOptions}
                    selected={selectedQuarterId}
                    onSelect={(v) => {
                      setSelectedQuarterId(v);
                      setSelectedSprintId("");
                    }}
                    placeholder="(none)"
                  />
                </div>
                <div>
                  <span className="text-sm font-medium block mb-1">Sprint</span>
                  <Dropdown
                    options={sprintOptions}
                    selected={selectedSprintId}
                    onSelect={(v) => setSelectedSprintId(v)}
                    placeholder={selectedQuarterId ? "(none)" : "Select a quarter first"}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="show-in-backlog"
                  type="checkbox"
                  checked={isBacklog}
                  onChange={(e) => setIsBacklog(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 cursor-pointer"
                />
                <label htmlFor="show-in-backlog" className="text-sm text-gray-700 cursor-pointer">
                  Show in backlog
                </label>
              </div>
            </>
          ) : (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              Your ticket will be added to the backlog for a developer to review and prioritise.
            </div>
          )}

          {isDeveloper && developers.length > 0 && (
            <div>
              <span className="text-sm font-medium block mb-1">Assigned developer</span>
              <Dropdown
                options={developerOptions}
                selected={developerUuid}
                onSelect={(v) => setDeveloperUuid(v)}
                placeholder="(unassigned)"
              />
            </div>
          )}

          <div>
            <span className="text-sm font-medium block mb-1">Description</span>
            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder={
                isBacklog
                  ? "What's needed? Steps to reproduce, screenshots, etc."
                  : "Notes, links, acceptance criteria..."
              }
            />
          </div>

          {taskId && (
            <AttachmentList parentType="task" parentId={taskId} uploadedByUserUuid={userUuid} />
          )}
        </div>

        {/* Right: chat panel */}
        {showChat && (
          <div className="w-[450px] flex-shrink-0 flex flex-col border-l pl-6 min-h-0">
            <TaskChat taskId={taskId} compact />
          </div>
        )}
      </div>
    </Modal>
  );
}
