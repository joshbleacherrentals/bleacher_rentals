"use client";

import { useEffect, useState } from "react";
import { X, FileText } from "lucide-react";
import { toast } from "sonner";
import { FileUploadInput } from "@/features/manageTeam/components/inputs/FileUploadInput";
import { useUserAccess } from "@/features/userAccess/client";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import {
  recordInspection,
  updateInspection,
  useInspectionHistory,
  type AnnualInspectionRow,
} from "../db/annualInspections";
import { canRecordInspection } from "../logic/canRecordInspection";
import { nextDueFromInspected } from "../logic/nextDueFromInspected";
import { inspectionStatus } from "../logic/inspectionStatus";
import { InspectionStatusPill } from "./InspectionStatusPill";

type Draft = {
  inspectedOn: string;
  nextDueOn: string;
  documentPath: string | null;
  notes: string;
};

const EMPTY: Draft = { inspectedOn: "", nextDueOn: "", documentPath: null, notes: "" };

function draftFrom(row: AnnualInspectionRow): Draft {
  return {
    inspectedOn: row.inspected_on ?? "",
    nextDueOn: row.next_due_on ?? "",
    documentPath: row.document_path,
    notes: row.notes ?? "",
  };
}

export function InspectionSheet({
  bleacherUuid,
  bleacherNumber,
  today,
  onClose,
}: {
  bleacherUuid: string;
  bleacherNumber: number | null;
  today: string;
  onClose: () => void;
}) {
  const access = useUserAccess();
  const roles = access.status === "active" ? access.roles : [];
  const userId = access.status === "active" ? access.userId : null;
  const canEdit = canRecordInspection(roles);

  const history = useInspectionHistory(bleacherUuid);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  // Close on Escape, like the other sheets in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /**
   * Typing the inspection date suggests next year's, but only into an empty
   * field: a date somebody typed by hand is the one that counts, and the
   * suggestion must never overwrite it.
   */
  const setInspectedOn = (value: string) => {
    setDraft((prev) => {
      const suggestion = nextDueFromInspected(value || null);
      return {
        ...prev,
        inspectedOn: value,
        nextDueOn: prev.nextDueOn === "" && suggestion ? suggestion : prev.nextDueOn,
      };
    });
  };

  const startNew = () => {
    setEditingId(null);
    setDraft(EMPTY);
  };

  const startEdit = (row: AnnualInspectionRow) => {
    setEditingId(row.id);
    setDraft(draftFrom(row));
  };

  const handleSave = async () => {
    if (!draft.nextDueOn) {
      toast.error("A next inspection date is required.");
      return;
    }
    setIsSaving(true);
    try {
      if (editingId) {
        await updateInspection({
          id: editingId,
          inspectedOn: draft.inspectedOn || null,
          nextDueOn: draft.nextDueOn,
          documentPath: draft.documentPath,
          notes: draft.notes || null,
        });
        toast.success("Inspection updated");
      } else {
        await recordInspection({
          bleacherUuid,
          inspectedOn: draft.inspectedOn || null,
          nextDueOn: draft.nextDueOn,
          documentPath: draft.documentPath,
          notes: draft.notes || null,
          createdBy: userId,
        });
        toast.success("Inspection recorded");
      }
      startNew();
    } catch (e) {
      toast.error(`Could not save the inspection: ${String(e)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Annual inspections for bleacher ${bleacherNumber ?? ""}`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-darkBlue">
            Bleacher {bleacherNumber != null ? `#${bleacherNumber}` : ""} — annual inspections
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {canEdit && (
          <div className="border-b border-gray-200 px-5 py-4">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">
              {editingId ? "Correct this record" : "Record an inspection"}
            </h3>

            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="inspected-on">
              Inspected on
            </label>
            <input
              id="inspected-on"
              type="date"
              value={draft.inspectedOn}
              onChange={(e) => setInspectedOn(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />

            <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="next-due-on">
              Next inspection due
            </label>
            <input
              id="next-due-on"
              type="date"
              value={draft.nextDueOn}
              onChange={(e) => setField("nextDueOn", e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />

            <div className="mb-3">
              <FileUploadInput
                label="Inspection PDF"
                bucket="bleacher-inspections"
                storagePath={`bleacher-${bleacherNumber ?? "unknown"}/inspection-${Date.now()}`}
                value={draft.documentPath}
                onChange={(v) => setField("documentPath", v)}
                acceptedTypes={["application/pdf"]}
                maxSizeMB={10}
              />
            </div>

            <label
              className="mb-1 block text-xs font-medium text-gray-600"
              htmlFor="inspection-notes"
            >
              Notes
            </label>
            <textarea
              id="inspection-notes"
              value={draft.notes}
              onChange={(e) => setField("notes", e.target.value)}
              rows={3}
              className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />

            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded-md bg-darkBlue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {editingId ? "Save changes" : "Record inspection"}
              </button>
              {editingId && (
                <button
                  onClick={startNew}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        <div className="px-5 py-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">History</h3>
          {history.length === 0 && (
            <p className="text-sm text-gray-400">No inspection has been recorded yet.</p>
          )}
          <ul className="space-y-3">
            {history.map((row, index) => (
              <li key={row.id} className="rounded-lg border border-gray-200 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-darkBlue">
                    Due {row.next_due_on ?? "—"}
                  </span>
                  {/* Only the newest row describes where the bleacher stands now. */}
                  {index === 0 && (
                    <InspectionStatusPill status={inspectionStatus(row.next_due_on, today)} />
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Inspected {row.inspected_on ?? "not recorded"}
                </p>
                {row.notes && <p className="mt-1 text-sm text-gray-700">{row.notes}</p>}
                <div className="mt-2 flex items-center gap-3">
                  {row.document_path && <InspectionDocumentLink path={row.document_path} />}
                  {canEdit && (
                    <button
                      onClick={() => startEdit(row)}
                      className="text-xs font-medium text-darkBlue underline"
                    >
                      Correct
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Opens the certificate from the bucket, the same way the NVIS PDF opens. */
export function InspectionDocumentLink({ path }: { path: string }) {
  const supabase = useClerkSupabaseClient();

  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    const { data } = supabase.storage.from("bleacher-inspections").getPublicUrl(path);
    window.open(data.publicUrl, "_blank");
  };

  return (
    <button
      onClick={open}
      className="inline-flex items-center gap-1 text-xs font-medium text-darkBlue underline"
    >
      <FileText className="h-3.5 w-3.5" />
      PDF
    </button>
  );
}
