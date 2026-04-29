"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Calendar, Inbox } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useQuarters } from "./_lib/hooks/useQuarters";
import { RoadmapHeader } from "./_lib/components/RoadmapHeader";
import { QuarterFormModal } from "./_lib/components/QuarterFormModal";
import { quarterLabel, quarterDateRange } from "./_lib/types";
import { useRoadmapAccessLevel } from "./_lib/hooks/useRoadmapAccessLevel";

export default function RoadmapHomePage() {
  const { quarters, isLoading } = useQuarters();
  const router = useRouter();
  const searchParams = useSearchParams();
  const newQuarter = searchParams.get("new") === "quarter";
  const { isDeveloper, isLoading: accessLoading } = useRoadmapAccessLevel();

  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!accessLoading && !isDeveloper) {
      router.replace("/roadmap/backlog");
    }
  }, [isDeveloper, accessLoading, router]);

  const closeModal = () => {
    if (newQuarter) router.push("/roadmap");
    setEditing(null);
  };

  const editingQuarter = quarters.find((q) => q.id === editing) ?? null;

  return (
    <main className="p-6 max-w-5xl mx-auto">
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {quarters.map((q) => (
            <div
              key={q.id}
              className="border rounded-lg p-4 hover:shadow-sm transition flex flex-col"
            >
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/roadmap/${q.id}`}
                    className="text-lg font-semibold hover:text-darkBlue"
                  >
                    {quarterLabel(q.year, q.quarter)}
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {quarterDateRange(q.year, q.quarter)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(q.id)}
                  className="text-xs text-gray-500 hover:text-darkBlue cursor-pointer"
                >
                  Edit
                </button>
              </div>
              <div className="mt-3 flex justify-end">
                <Link href={`/roadmap/${q.id}`} className="text-sm text-darkBlue hover:underline">
                  Open →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <QuarterFormModal
        open={newQuarter || editing !== null}
        onClose={closeModal}
        existing={editingQuarter}
      />
    </main>
  );
}
