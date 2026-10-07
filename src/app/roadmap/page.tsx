"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Plus, Calendar, Inbox } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useQuarters } from "./_lib/hooks/useQuarters";
import { PageHeaderWithBreadCrumbs as RoadmapHeader } from "@/components/PageHeaderWithBreadCrumbs";
import { QuarterFormModal } from "./_lib/components/QuarterFormModal";
import { QuarterYearList } from "./_lib/components/QuarterYearList";
import { groupQuartersByYear } from "./_lib/util/groupQuartersByYear";
import { useRoadmapAccessLevel } from "./_lib/hooks/useRoadmapAccessLevel";

export default function RoadmapHomePage() {
  const { quarters, isLoading } = useQuarters();
  const router = useRouter();
  const searchParams = useSearchParams();
  const newQuarter = searchParams.get("new") === "quarter";
  const { isDeveloper, isLoading: accessLoading } = useRoadmapAccessLevel();

  const [editing, setEditing] = useState<string | null>(null);
  // Set by the "Create <current quarter>" card so the modal opens on that quarter.
  const [createDefaults, setCreateDefaults] = useState<{ year: number; quarter: number } | null>(
    null,
  );
  const groups = useMemo(() => groupQuartersByYear(quarters), [quarters]);
  const openCreate = (year: number, quarter: number) => setCreateDefaults({ year, quarter });

  useEffect(() => {
    if (!accessLoading && !isDeveloper) {
      router.replace("/roadmap/backlog");
    }
  }, [isDeveloper, accessLoading, router]);

  const closeModal = () => {
    if (newQuarter) router.push("/roadmap");
    setEditing(null);
    setCreateDefaults(null);
  };

  const editingQuarter = quarters.find((q) => q.id === editing) ?? null;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <RoadmapHeader
        crumbs={[{ label: "Roadmap" }]}
        description="Plan quarters, run sprints, and ship features."
        rightSlot={
          <>
            <Link
              href="/roadmap/backlog"
              className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm flex items-center gap-1 cursor-pointer"
            >
              <Inbox className="size-4" />
              Backlog
            </Link>
            <PrimaryButton onClick={() => router.push("/roadmap?new=quarter")}>
              <Plus className="size-4" />
              New Quarter
            </PrimaryButton>
          </>
        }
      />

      {isLoading ? (
        <p className="text-sm text-gray-500">Loading quarters...</p>
      ) : quarters.length === 0 ? (
        <div className="border border-dashed rounded p-10 text-center">
          <Calendar className="size-8 mx-auto text-gray-400 mb-2" />
          <h3 className="font-medium">No quarters yet</h3>
          <p className="text-sm text-gray-500 mt-1">
            Create your first quarter to start planning sprints and features.
          </p>
          <div className="mt-4 flex justify-center">
            <PrimaryButton onClick={() => router.push("/roadmap?new=quarter")}>
              <Plus className="size-4" />
              New Quarter
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <QuarterYearList groups={groups} onEdit={setEditing} onCreate={openCreate} />
      )}

      <QuarterFormModal
        open={newQuarter || editing !== null || createDefaults !== null}
        onClose={closeModal}
        existing={editingQuarter}
        defaults={createDefaults}
      />
    </div>
  );
}
