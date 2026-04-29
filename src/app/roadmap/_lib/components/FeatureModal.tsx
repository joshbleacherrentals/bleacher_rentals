"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { PrimaryButton } from "@/components/PrimaryButton";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { Dropdown } from "@/components/DropDown";
import { RichTextEditor } from "./RichTextEditor";
import { AttachmentList } from "./AttachmentList";
import { useFeature } from "../hooks/useFeatures";
import { useSprintsForQuarter } from "../hooks/useSprints";
import { useRoadmapCurrentUserUuid } from "../hooks/useRoadmapCurrentUserUuid";
import { saveFeature, deleteFeature } from "../db/features";
import { sprintLabel } from "../types";
import { DEFAULT_FEATURE_STATUS, FEATURE_STATUS_OPTIONS } from "../constants";
import type { FeatureStatus } from "../types";

type Props = {
  open: boolean;
  onClose: () => void;
  quarterId: string;
  featureId: string | null;
};

export function FeatureModal({ open, onClose, quarterId, featureId }: Props) {
  const { feature } = useFeature(featureId);
  const { sprints } = useSprintsForQuarter(quarterId);
  const { userUuid } = useRoadmapCurrentUserUuid();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<FeatureStatus>(DEFAULT_FEATURE_STATUS);
  const [sprintIds, setSprintIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(feature?.title ?? "");
    setDescription(feature?.description ?? "");
    setStatus(feature?.status ?? DEFAULT_FEATURE_STATUS);
    setSprintIds(feature?.sprint_ids ?? []);
  }, [open, feature]);

  const toggleSprint = (sprintId: string) => {
    setSprintIds((prev) =>
      prev.includes(sprintId) ? prev.filter((id) => id !== sprintId) : [...prev, sprintId],
    );
  };

  const handleSave = async () => {
    if (!title.trim()) {
      createErrorToast(["Title is required"]);
      return;
    }
    setSubmitting(true);
    try {
      await saveFeature({
        featureId: featureId,
        quarterId,
        title: title.trim(),
        description: description.trim() ? description : null,
        status,
        sprintIds,
      });
      createSuccessToast(["Feature saved"]);
      onClose();
    } catch (err: any) {
      createErrorToast(["Save failed", err.message ?? String(err)]);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!featureId) return;
    if (!confirm("Delete this feature?")) return;
    setSubmitting(true);
    try {
      await deleteFeature(featureId);
      createSuccessToast(["Feature deleted"]);
      onClose();
    } catch (err: any) {
      createErrorToast(["Delete failed", err.message ?? String(err)]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={featureId ? "Edit Feature" : "New Feature"}
      size="lg"
      footer={
        <>
          {featureId && (
            <PrimaryButton
              className="bg-red-700 hover:bg-red-800"
              loading={submitting}
              onClick={handleDelete}
            >
              Delete
            </PrimaryButton>
          )}
          <PrimaryButton loading={submitting} loadingText="Saving..." onClick={handleSave}>
            Save
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What's this feature?"
            className="mt-1 w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-greenAccent"
          />
        </label>

        <div>
          <span className="text-sm font-medium block mb-1">Status</span>
          <Dropdown
            options={FEATURE_STATUS_OPTIONS}
            selected={status}
            onSelect={(v) => setStatus(v as FeatureStatus)}
            placeholder="Select Status"
          />
        </div>

        <div>
          <span className="text-sm font-medium block mb-1">Sprint labels</span>
          <div className="flex flex-wrap gap-2">
            {sprints.length === 0 && (
              <p className="text-xs text-gray-400 italic">No sprints yet for this quarter.</p>
            )}
            {sprints.map((s) => {
              const active = sprintIds.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => toggleSprint(s.id)}
                  className={`px-2 py-1 rounded text-xs border cursor-pointer ${
                    active
                      ? "bg-darkBlue text-white border-darkBlue"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {sprintLabel(s.sprint_number)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-sm font-medium block mb-1">Description</span>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Goals, acceptance criteria, links..."
          />
        </div>

        {featureId && (
          <div>
            <AttachmentList
              parentType="feature"
              parentId={featureId}
              uploadedByUserUuid={userUuid}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
