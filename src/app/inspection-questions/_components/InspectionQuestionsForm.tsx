"use client";

import { useMemo, useState, useCallback } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery, typedExecute } from "@/lib/powersync/typedQuery";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { PrimaryButton } from "@/components/PrimaryButton";
import { QuestionRow } from "./QuestionRow";

export type InspectionQuestion = {
  id: string;
  question_text: string | null;
  required: number | null;
  question_type: string | null;
  is_active: number | null;
  sort_order: number | null;
};

const QUESTION_TYPES = ["text", "checkbox", "photo"] as const;

export function InspectionQuestionsForm() {
  const [saving, setSaving] = useState(false);
  const [showDeleted, setShowDeleted] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const compiled = useMemo(() => {
    return db.selectFrom("InspectionQuestions").selectAll().orderBy("sort_order", "asc").compile();
  }, []);

  const { data: allQuestions, isLoading } = useTypedQuery(compiled, expect<InspectionQuestion>());

  const questions = useMemo(() => {
    if (!allQuestions) return [];
    if (showDeleted) return allQuestions;
    return allQuestions.filter((q) => q.is_active === 1);
  }, [allQuestions, showDeleted]);

  async function addQuestion() {
    const maxSort = allQuestions?.reduce((max, q) => Math.max(max, q.sort_order ?? 0), 0) ?? 0;
    try {
      const insert = db
        .insertInto("InspectionQuestions")
        .values({
          id: crypto.randomUUID(),
          question_text: "New question",
          required: 0,
          question_type: "text",
          is_active: 1,
          sort_order: maxSort + 1,
        })
        .compile();
      await typedExecute(insert);
      createSuccessToast(["Question added"]);
    } catch (e) {
      createErrorToastNoThrow(["Failed to add question"]);
    }
  }

  async function updateQuestion(id: string, field: string, value: string | number) {
    try {
      const update = db
        .updateTable("InspectionQuestions")
        .set({ [field]: value })
        .where("id", "=", id)
        .compile();
      await typedExecute(update);
    } catch (e) {
      createErrorToastNoThrow(["Failed to update question"]);
    }
  }

  async function softDeleteQuestion(id: string) {
    try {
      const update = db
        .updateTable("InspectionQuestions")
        .set({ is_active: 0 })
        .where("id", "=", id)
        .compile();
      await typedExecute(update);
      createSuccessToast(["Question deleted"]);
    } catch (e) {
      createErrorToastNoThrow(["Failed to delete question"]);
    }
  }

  async function restoreQuestion(id: string) {
    try {
      const update = db
        .updateTable("InspectionQuestions")
        .set({ is_active: 1 })
        .where("id", "=", id)
        .compile();
      await typedExecute(update);
      createSuccessToast(["Question restored"]);
    } catch (e) {
      createErrorToastNoThrow(["Failed to restore question"]);
    }
  }

  const handleDrop = useCallback(
    async (dragId: string, dropId: string) => {
      setDragOverId(null);
      if (dragId === dropId || !questions) return;

      const dragIdx = questions.findIndex((q) => q.id === dragId);
      const dropIdx = questions.findIndex((q) => q.id === dropId);
      if (dragIdx === -1 || dropIdx === -1) return;

      // Build new order
      const reordered = [...questions];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(dropIdx, 0, moved);

      try {
        setSaving(true);
        for (let i = 0; i < reordered.length; i++) {
          if (reordered[i].sort_order !== i) {
            const update = db
              .updateTable("InspectionQuestions")
              .set({ sort_order: i })
              .where("id", "=", reordered[i].id)
              .compile();
            await typedExecute(update);
          }
        }
      } catch (e) {
        createErrorToastNoThrow(["Failed to reorder questions"]);
      } finally {
        setSaving(false);
      }
    },
    [questions],
  );

  if (isLoading) {
    return <div className="text-gray-500 text-sm">Loading questions...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="rounded border-gray-300"
          />
          Show deleted questions
        </label>
      </div>

      {questions.length === 0 && (
        <p className="text-gray-400 text-sm">No questions yet. Add one to get started.</p>
      )}

      <div className="space-y-2">
        {questions.map((q) => (
          <QuestionRow
            key={q.id}
            question={q}
            questionTypes={QUESTION_TYPES}
            onUpdate={updateQuestion}
            onDelete={softDeleteQuestion}
            onRestore={restoreQuestion}
            onDrop={handleDrop}
            onDragOver={setDragOverId}
            isDragOver={dragOverId === q.id}
            disabled={saving}
          />
        ))}

        <button
          type="button"
          onClick={addQuestion}
          className="w-full border-2 border-dashed border-gray-300 rounded-lg p-3 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500 hover:bg-gray-50 transition-colors cursor-pointer"
        >
          + Add Question
        </button>
      </div>
    </div>
  );
}
