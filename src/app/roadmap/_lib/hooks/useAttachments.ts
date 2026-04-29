"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import type { Attachment, AttachmentParentType } from "../types";

type Row = {
  id: string;
  created_at: string | null;
  parent_type: string | null;
  parent_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_by_user_uuid: string | null;
};

export function useAttachments(parentType: AttachmentParentType, parentId: string | null) {
  const safeId = parentId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapAttachments")
        .select([
          "id",
          "created_at",
          "parent_type",
          "parent_id",
          "storage_bucket",
          "storage_path",
          "file_name",
          "mime_type",
          "file_size_bytes",
          "uploaded_by_user_uuid",
        ])
        .where("parent_type", "=", parentType)
        .where("parent_id", "=", safeId)
        .orderBy("created_at", "asc")
        .compile(),
    [parentType, safeId]
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  const attachments = useMemo<Attachment[]>(
    () =>
      (data ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at ?? "",
        parent_type: (r.parent_type as AttachmentParentType) ?? "task",
        parent_id: r.parent_id ?? "",
        storage_bucket: r.storage_bucket ?? "",
        storage_path: r.storage_path ?? "",
        file_name: r.file_name ?? "",
        mime_type: r.mime_type,
        file_size_bytes: r.file_size_bytes,
        uploaded_by_user_uuid: r.uploaded_by_user_uuid,
      })),
    [data]
  );

  return { attachments, isLoading, error };
}
