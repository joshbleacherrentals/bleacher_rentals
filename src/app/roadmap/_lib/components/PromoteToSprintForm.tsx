"use client";

import { useMemo, useState } from "react";
import { useQuarters } from "../hooks/useQuarters";
import { useSprintsForQuarter } from "../hooks/useSprints";
import { useFeaturesForQuarter } from "../hooks/useFeatures";
import { Dropdown } from "@/components/DropDown";
import { PrimaryButton } from "@/components/PrimaryButton";
import { quarterLabel, sprintLabel } from "../types";

type Props = {
  onCancel: () => void;
  onPromote: (sprintId: string, featureId: string | null) => void;
  submitting: boolean;
};

export function PromoteToSprintForm({ onCancel, onPromote, submitting }: Props) {
  const { quarters } = useQuarters();
  const [quarterId, setQuarterId] = useState<string>(quarters[0]?.id ?? "");
  const [sprintId, setSprintId] = useState<string>("");
  const [featureId, setFeatureId] = useState<string>("");

  const effectiveQuarter = quarterId || quarters[0]?.id || null;
  const { sprints } = useSprintsForQuarter(effectiveQuarter);
  const { features } = useFeaturesForQuarter(effectiveQuarter);

  const quarterOptions = useMemo(
    () => quarters.map((q) => ({ label: quarterLabel(q.year, q.quarter), value: q.id })),
    [quarters],
  );
  const sprintOptions = useMemo(
    () => sprints.map((s) => ({ label: sprintLabel(s.sprint_number), value: s.id })),
    [sprints],
  );
  const featureOptions = useMemo(
    () => [
      { label: "(none)", value: "" },
      ...features.map((f) => ({ label: f.title, value: f.id })),
    ],
    [features],
  );

  const handleConfirm = () => {
    if (!sprintId) return;
    onPromote(sprintId, featureId || null);
  };

  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs font-medium block mb-1">Quarter</span>
        <Dropdown
          options={quarterOptions}
          selected={effectiveQuarter ?? ""}
          onSelect={(v) => {
            setQuarterId(v);
            setSprintId("");
            setFeatureId("");
          }}
          placeholder="Select Quarter"
        />
      </div>

      <div>
        <span className="text-xs font-medium block mb-1">Sprint</span>
        <Dropdown
          options={sprintOptions}
          selected={sprintId}
          onSelect={(v) => setSprintId(v)}
          placeholder="Select Sprint"
        />
      </div>

      <div>
        <span className="text-xs font-medium block mb-1">Link to feature (optional)</span>
        <Dropdown
          options={featureOptions}
          selected={featureId}
          onSelect={(v) => setFeatureId(v)}
          placeholder="(none)"
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-100 cursor-pointer"
        >
          Cancel
        </button>
        <PrimaryButton
          loading={submitting}
          loadingText="Promoting..."
          onClick={handleConfirm}
          disabled={!sprintId}
        >
          Confirm
        </PrimaryButton>
      </div>
    </div>
  );
}
