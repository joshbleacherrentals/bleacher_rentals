"use client";

import { useState, useMemo, useEffect } from "react";
import React from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { FileUploadInput } from "@/features/manageTeam/components/inputs/FileUploadInput";
import { ErrorToast } from "@/components/toasts/ErrorToast";
import { SuccessToast } from "@/components/toasts/SuccessToast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type WorkTrackerRow = {
  id: string;
  date: string | null;
  bleacher_uuid: string | null;
  pre_inspection_uuid: string | null;
  post_inspection_uuid: string | null;
  bleacher: { bleacher_number: number } | null;
  work_tracker_type: { display_name: string } | null;
};

export type EditDamageReport = {
  id: string;
  bleacher_uuid: string;
  inspection_uuid: string;
  is_safe_to_sit: boolean;
  is_safe_to_haul: boolean;
  note: string | null;
  resolved_at: string | null;
  maintenance_event_uuid: string | null;
  bleacher: { bleacher_number: number } | null;
  photos: { id: string; photo_path: string }[];
};

type DamageReportModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editReport?: EditDamageReport | null;
};

export function DamageReportModal({
  open,
  onOpenChange,
  onSaved,
  editReport,
}: DamageReportModalProps) {
  const supabase = useClerkSupabaseClient();
  const isEditing = !!editReport;

  const [selectedWorkTrackerId, setSelectedWorkTrackerId] = useState("");
  const [selectedInspection, setSelectedInspection] = useState<"pre" | "post" | "">("");
  const [isSafeToSit, setIsSafeToSit] = useState(true);
  const [isSafeToHaul, setIsSafeToHaul] = useState(true);
  const [note, setNote] = useState("");
  const [isResolved, setIsResolved] = useState(false);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [existingPhotos, setExistingPhotos] = useState<{ id: string; photo_path: string }[]>([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (open && editReport) {
      setIsSafeToSit(editReport.is_safe_to_sit);
      setIsSafeToHaul(editReport.is_safe_to_haul);
      setNote(editReport.note ?? "");
      setIsResolved(!!editReport.resolved_at);
      setExistingPhotos(editReport.photos ?? []);
      setRemovedPhotoIds([]);
      setPhotoPaths([]);
    }
  }, [open, editReport]);

  // Fetch work trackers that have at least one inspection (create mode only)
  const { data: workTrackers = [], isLoading: loadingWt } = useQuery({
    queryKey: ["work-trackers-with-inspections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("WorkTrackers")
        .select(
          `
          id,
          date,
          bleacher_uuid,
          pre_inspection_uuid,
          post_inspection_uuid,
          bleacher:Bleachers!WorkTrackers_bleacher_uuid_fkey(bleacher_number),
          work_tracker_type:WorkTrackerTypes!worktrackers_work_tracker_type_uuid_fkey(display_name)
        `,
        )
        .or("pre_inspection_uuid.not.is.null,post_inspection_uuid.not.is.null")
        .order("date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as WorkTrackerRow[];
    },
    enabled: !!supabase && open && !isEditing,
  });

  const selectedWt = useMemo(
    () => workTrackers.find((wt) => wt.id === selectedWorkTrackerId) ?? null,
    [workTrackers, selectedWorkTrackerId],
  );

  // Determine which inspection options are available for the selected work tracker
  const inspectionOptions = useMemo(() => {
    if (!selectedWt) return [];
    const opts: { value: "pre" | "post"; label: string }[] = [];
    if (selectedWt.pre_inspection_uuid) opts.push({ value: "pre", label: "Pre-Trip (Pickup)" });
    if (selectedWt.post_inspection_uuid) opts.push({ value: "post", label: "Post-Trip (Dropoff)" });
    return opts;
  }, [selectedWt]);

  // Auto-select inspection if only one is available
  const effectiveInspection = useMemo(() => {
    if (inspectionOptions.length === 1) return inspectionOptions[0].value;
    return selectedInspection || "";
  }, [inspectionOptions, selectedInspection]);

  const resolvedInspectionUuid = useMemo(() => {
    if (isEditing) return editReport.inspection_uuid;
    if (!selectedWt || !effectiveInspection) return null;
    return effectiveInspection === "pre"
      ? selectedWt.pre_inspection_uuid
      : selectedWt.post_inspection_uuid;
  }, [isEditing, editReport, selectedWt, effectiveInspection]);

  const resolvedBleacherUuid = isEditing
    ? editReport.bleacher_uuid
    : (selectedWt?.bleacher_uuid ?? null);

  const handleAddPhoto = (path: string | null) => {
    if (path) setPhotoPaths((prev) => [...prev, path]);
  };

  const handleRemoveNewPhoto = (index: number) => {
    setPhotoPaths((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRemoveExistingPhoto = (photoId: string) => {
    setRemovedPhotoIds((prev) => [...prev, photoId]);
    setExistingPhotos((prev) => prev.filter((p) => p.id !== photoId));
  };

  const resetForm = () => {
    setSelectedWorkTrackerId("");
    setSelectedInspection("");
    setIsSafeToSit(true);
    setIsSafeToHaul(true);
    setNote("");
    setIsResolved(false);
    setPhotoPaths([]);
    setExistingPhotos([]);
    setRemovedPhotoIds([]);
    setSaving(false);
  };

  const handleSubmit = async () => {
    if (isEditing) {
      await handleUpdate();
    } else {
      await handleCreate();
    }
  };

  const handleCreate = async () => {
    if (!selectedWorkTrackerId || !resolvedInspectionUuid || !resolvedBleacherUuid) {
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: ["Please select a work tracker and inspection."],
          }),
        { duration: 5000 },
      );
      return;
    }

    setSaving(true);
    try {
      const { data: damageReport, error: drError } = await supabase
        .from("DamageReports")
        .insert({
          bleacher_uuid: resolvedBleacherUuid,
          inspection_uuid: resolvedInspectionUuid,
          is_safe_to_sit: isSafeToSit,
          is_safe_to_haul: isSafeToHaul,
          note: note || null,
        })
        .select("id")
        .single();

      if (drError || !damageReport) {
        throw new Error(drError?.message ?? "Failed to create damage report");
      }

      if (photoPaths.length > 0) {
        const photoInserts = photoPaths.map((photo_path) => ({
          damage_report_uuid: damageReport.id,
          photo_path,
        }));
        const { error: photoError } = await supabase
          .from("DamageReportPhotos")
          .insert(photoInserts);

        if (photoError) {
          console.warn("Photos linked partially:", photoError.message);
        }
      }

      toast.custom(
        (t) => React.createElement(SuccessToast, { id: t, lines: ["Damage report created."] }),
        { duration: 5000 },
      );
      resetForm();
      onSaved();
    } catch (err: any) {
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: ["Failed to create damage report.", err?.message ?? ""],
          }),
        { duration: 10000 },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editReport) return;

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("DamageReports")
        .update({
          is_safe_to_sit: isSafeToSit,
          is_safe_to_haul: isSafeToHaul,
          note: note || null,
          resolved_at: isResolved ? (editReport.resolved_at ?? new Date().toISOString()) : null,
        })
        .eq("id", editReport.id);

      if (updateError) throw new Error(updateError.message);

      // Remove deleted photos
      if (removedPhotoIds.length > 0) {
        await supabase.from("DamageReportPhotos").delete().in("id", removedPhotoIds);
      }

      // Add new photos
      if (photoPaths.length > 0) {
        const photoInserts = photoPaths.map((photo_path) => ({
          damage_report_uuid: editReport.id,
          photo_path,
        }));
        await supabase.from("DamageReportPhotos").insert(photoInserts);
      }

      toast.custom(
        (t) => React.createElement(SuccessToast, { id: t, lines: ["Damage report updated."] }),
        { duration: 5000 },
      );
      resetForm();
      onSaved();
    } catch (err: any) {
      toast.custom(
        (t) =>
          React.createElement(ErrorToast, {
            id: t,
            lines: ["Failed to update damage report.", err?.message ?? ""],
          }),
        { duration: 10000 },
      );
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const displayBleacherNumber = isEditing
    ? editReport.bleacher?.bleacher_number
    : selectedWt?.bleacher?.bleacher_number;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Damage Report" : "Create Damage Report"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the damage report details below."
              : "Select a work tracker and inspection, then describe the damage."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Work Tracker selector — create mode only */}
          {!isEditing && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Work Tracker <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedWorkTrackerId}
                onChange={(e) => {
                  setSelectedWorkTrackerId(e.target.value);
                  setSelectedInspection("");
                }}
                className="w-full px-3 py-2 border rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
              >
                <option value="">{loadingWt ? "Loading..." : "Select work tracker..."}</option>
                {workTrackers.map((wt) => (
                  <option key={wt.id} value={wt.id}>
                    {wt.date ? new Date(wt.date).toLocaleDateString() : "No date"} —{" "}
                    {wt.work_tracker_type?.display_name ?? "Unknown type"} — Bleacher #
                    {wt.bleacher?.bleacher_number ?? "?"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Inspection selector (only if work tracker has both) — create mode only */}
          {!isEditing && selectedWt && inspectionOptions.length > 1 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                Inspection <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedInspection}
                onChange={(e) => setSelectedInspection(e.target.value as "pre" | "post")}
                className="w-full px-3 py-2 border rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0"
              >
                <option value="">Select inspection...</option>
                {inspectionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Auto-selected inspection info when only one exists — create mode only */}
          {!isEditing && selectedWt && inspectionOptions.length === 1 && (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              Inspection: <span className="font-medium">{inspectionOptions[0].label}</span> (only
              inspection available)
            </div>
          )}

          {/* Bleacher display */}
          {displayBleacherNumber != null && (
            <div className="text-sm text-gray-500 bg-gray-50 rounded-md px-3 py-2">
              Bleacher: <span className="font-medium">#{displayBleacherNumber}</span>
            </div>
          )}

          {/* Resolved toggle — edit mode only */}
          {isEditing && (
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Resolved</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsResolved(!isResolved)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${isResolved ? "bg-green-500" : "bg-gray-300"}`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isResolved ? "translate-x-6" : "translate-x-1"}`}
                  />
                </button>
                <span className="text-sm text-gray-500 w-6">{isResolved ? "Yes" : "No"}</span>
              </div>
            </div>
          )}

          {/* Safe to sit */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Safe to Sit</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSafeToSit(!isSafeToSit)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${isSafeToSit ? "bg-green-500" : "bg-red-500"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isSafeToSit ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
              <span className="text-sm text-gray-500 w-6">{isSafeToSit ? "Yes" : "No"}</span>
            </div>
          </div>

          {/* Safe to haul */}
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Safe to Haul</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSafeToHaul(!isSafeToHaul)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${isSafeToHaul ? "bg-green-500" : "bg-red-500"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isSafeToHaul ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
              <span className="text-sm text-gray-500 w-6">{isSafeToHaul ? "Yes" : "No"}</span>
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe the damage..."
              rows={3}
              className="w-full px-3 py-2 border rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-greenAccent focus:border-0 resize-none"
            />
          </div>

          {/* Photos */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Photos</label>
            <div className="space-y-2">
              {/* Existing photos (edit mode) */}
              {existingPhotos.map((photo) => (
                <div
                  key={photo.id}
                  className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2 text-sm"
                >
                  <span className="truncate flex-1 text-gray-600">
                    {photo.photo_path.split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveExistingPhoto(photo.id)}
                    className="text-red-500 hover:text-red-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {/* New photos */}
              {photoPaths.map((path, i) => (
                <div
                  key={`new-${i}`}
                  className="flex items-center gap-2 bg-gray-50 border rounded-md px-3 py-2 text-sm"
                >
                  <span className="truncate flex-1 text-gray-600">{path.split("/").pop()}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveNewPhoto(i)}
                    className="text-red-500 hover:text-red-700 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <FileUploadInput
                label=""
                bucket="damage-report-photos"
                storagePath={`bleacher-${resolvedBleacherUuid || "unknown"}/damage-${Date.now()}`}
                value={null}
                onChange={handleAddPhoto}
                acceptedTypes={[
                  "image/jpeg",
                  "image/jpg",
                  "image/png",
                  "image/heic",
                  "image/heif",
                  "image/webp",
                ]}
                maxSizeMB={10}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 transition cursor-pointer text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || (!isEditing && (!resolvedInspectionUuid || !resolvedBleacherUuid))}
            className="px-4 py-2 bg-darkBlue text-white rounded-md hover:bg-lightBlue transition cursor-pointer disabled:opacity-50 text-sm font-semibold"
          >
            {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Report"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
