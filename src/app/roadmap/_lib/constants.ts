import type { FeatureStatus, TaskStatus } from "./types";

export const ATTACHMENTS_BUCKET = "roadmap-attachments";

export const FEATURE_STATUS_OPTIONS: { label: string; value: FeatureStatus }[] = [
  { label: "Draft", value: "draft" },
  { label: "Locked In", value: "locked_in" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
];

export const FEATURE_STATUS_META: Record<FeatureStatus, { label: string; hex: string }> = {
  draft: { label: "Draft", hex: "#e5e7eb" },
  locked_in: { label: "Locked In", hex: "#fcd34d" },
  in_progress: { label: "In Progress", hex: "#7b9ee7" },
  completed: { label: "Completed", hex: "#86efac" },
};

export const TASK_STATUS_OPTIONS: { label: string; value: TaskStatus }[] = [
  { label: "To Do", value: "to_do" },
  { label: "In Progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
];

export const TASK_STATUS_META: Record<TaskStatus, { label: string; hex: string }> = {
  to_do: { label: "To Do", hex: "#e5e7eb" },
  in_progress: { label: "In Progress", hex: "#7b9ee7" },
  completed: { label: "Completed", hex: "#86efac" },
};

export const DEFAULT_FEATURE_STATUS: FeatureStatus = "draft";
export const DEFAULT_TASK_STATUS: TaskStatus = "to_do";
