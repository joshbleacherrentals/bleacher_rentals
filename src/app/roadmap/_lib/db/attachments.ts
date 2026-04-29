import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ATTACHMENTS_BUCKET } from "../constants";
import type { AttachmentParentType } from "../types";

export type UploadAttachmentInput = {
  supabase: SupabaseClient<any>;
  parentType: AttachmentParentType;
  parentId: string;
  file: File;
  uploadedByUserUuid: string | null;
};

export async function uploadAttachment(input: UploadAttachmentInput) {
  const id = crypto.randomUUID();
  const safeName = input.file.name.replace(/[^a-zA-Z0-9._-]+/g, "_");
  const storagePath = `${input.parentType}/${input.parentId}/${id}-${safeName}`;

  const { error } = await input.supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, input.file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  await typedExecute(
    db
      .insertInto("RoadmapAttachments")
      .values({
        id,
        created_at: new Date().toISOString(),
        parent_type: input.parentType,
        parent_id: input.parentId,
        storage_bucket: ATTACHMENTS_BUCKET,
        storage_path: storagePath,
        file_name: input.file.name,
        mime_type: input.file.type || null,
        file_size_bytes: input.file.size,
        uploaded_by_user_uuid: input.uploadedByUserUuid,
      })
      .compile()
  );

  return id;
}

export async function deleteAttachment(opts: {
  supabase: SupabaseClient<any>;
  attachmentId: string;
  storageBucket: string;
  storagePath: string;
}) {
  await opts.supabase.storage.from(opts.storageBucket).remove([opts.storagePath]);
  await typedExecute(
    db
      .deleteFrom("RoadmapAttachments")
      .where("id", "=", opts.attachmentId)
      .compile()
  );
}

export async function reassignAttachments(opts: {
  fromParentType: AttachmentParentType;
  fromParentId: string;
  toParentType: AttachmentParentType;
  toParentId: string;
}) {
  await typedExecute(
    db
      .updateTable("RoadmapAttachments")
      .set({
        parent_type: opts.toParentType,
        parent_id: opts.toParentId,
      })
      .where("parent_type", "=", opts.fromParentType)
      .where("parent_id", "=", opts.fromParentId)
      .compile()
  );
}

export function getPublicUrl(supabase: SupabaseClient<any>, storagePath: string) {
  const { data } = supabase.storage.from(ATTACHMENTS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}
