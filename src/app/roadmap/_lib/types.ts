import type { Database, Tables } from "../../../../database.types";

export type FeatureStatus = Database["public"]["Enums"]["roadmap_feature_status"];
export type TaskStatus = Database["public"]["Enums"]["roadmap_task_status"];
export type AttachmentParentType = Database["public"]["Enums"]["roadmap_attachment_parent_type"];

export type Quarter = Tables<"RoadmapQuarters">;
export type Sprint = Tables<"RoadmapSprints">;
export type FeatureRow = Tables<"RoadmapFeatures">;
export type FeatureSprintLabel = Tables<"RoadmapFeatureSprintLabels">;
export type TaskRow = Tables<"RoadmapTasks">;
export type Attachment = Tables<"RoadmapAttachments">;
export type TaskSubscription = Tables<"RoadmapTaskSubscriptions">;
export type TaskMessage = Tables<"RoadmapTaskMessages">;
export type TaskMessageReadReceipt = Tables<"RoadmapTaskMessageReadReceipts">;
export type TaskTypingIndicator = Tables<"RoadmapTaskTypingIndicators">;

export type Feature = FeatureRow & {
  sprint_ids: string[];
};

export type SprintWithCounts = Sprint & {
  task_count: number;
  task_done_count: number;
};

export type SimpleUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  status_uuid: string | null;
};

export type MessageWithUser = TaskMessage & {
  user_first_name: string | null;
  user_last_name: string | null;
  user_email: string;
  read_by_count: number;
};

/** "Q2 2026" */
export function quarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

/** Approximate date range for a quarter, e.g. "Apr 1 – Jun 30, 2026" */
export function quarterDateRange(year: number, quarter: number): string {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

/** "Sprint 3" */
export function sprintLabel(sprintNumber: number): string {
  return `Sprint ${sprintNumber}`;
}
