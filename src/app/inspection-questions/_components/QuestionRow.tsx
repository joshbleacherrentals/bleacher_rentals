"use client";

import { useState, useRef } from "react";
import { GripVertical, Trash2, RotateCcw } from "lucide-react";
import type { InspectionQuestion } from "./InspectionQuestionsForm";

type QuestionRowProps = {
  question: InspectionQuestion;
  questionTypes: readonly string[];
  onUpdate: (id: string, field: string, value: string | number) => void;
  onDelete: (id: string) => void;
  onRestore: (id: string) => void;
  onDrop: (dragId: string, dropId: string) => void;
  onDragOver: (id: string | null) => void;
  isDragOver: boolean;
  disabled: boolean;
};

export function QuestionRow({
  question,
  questionTypes,
  onUpdate,
  onDelete,
  onRestore,
  onDrop,
  onDragOver,
  isDragOver,
  disabled,
}: QuestionRowProps) {
  const [text, setText] = useState(question.question_text ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDeleted = question.is_active !== 1;

  function handleTextChange(value: string) {
    setText(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onUpdate(question.id, "question_text", value);
    }, 500);
  }

  return (
    <div
      draggable={!isDeleted}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", question.id)}
      onDragOver={(e) => {
        e.preventDefault();
        onDragOver(question.id);
      }}
      onDragLeave={() => onDragOver(null)}
      onDrop={(e) => {
        e.preventDefault();
        const dragId = e.dataTransfer.getData("text/plain");
        onDrop(dragId, question.id);
      }}
      className={`flex items-center gap-3 rounded-lg p-3 shadow-sm transition-colors ${
        isDeleted
          ? "bg-gray-50 border border-dashed border-gray-300 opacity-60"
          : isDragOver
            ? "bg-blue-50 border-2 border-blue-300"
            : "bg-white border border-gray-200"
      }`}
    >
      {/* Drag handle */}
      {!isDeleted && (
        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600">
          <GripVertical className="h-5 w-5" />
        </div>
      )}
      {isDeleted && <div className="w-5" />}

      {/* Question text */}
      <input
        type="text"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        placeholder="Enter question text..."
        disabled={isDeleted}
        className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-darkBlue disabled:bg-gray-100 disabled:text-gray-400"
      />

      {/* Question type */}
      <select
        value={question.question_type ?? "text"}
        onChange={(e) => onUpdate(question.id, "question_type", e.target.value)}
        disabled={isDeleted}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-darkBlue disabled:bg-gray-100 disabled:text-gray-400"
      >
        {questionTypes.map((type) => (
          <option key={type} value={type}>
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </option>
        ))}
      </select>

      {/* Required toggle */}
      <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={question.required === 1}
          onChange={(e) => onUpdate(question.id, "required", e.target.checked ? 1 : 0)}
          disabled={isDeleted}
          className="rounded border-gray-300"
        />
        Required
      </label>

      {/* Delete / Restore */}
      {isDeleted ? (
        <button
          type="button"
          onClick={() => onRestore(question.id)}
          disabled={disabled}
          className="p-1.5 rounded hover:bg-green-50 text-green-600 hover:text-green-800 disabled:opacity-30 cursor-pointer"
          title="Restore question"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onDelete(question.id)}
          disabled={disabled}
          className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700 disabled:opacity-30 cursor-pointer"
          title="Delete question"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
